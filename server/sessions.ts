import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';

/**
 * Workout summaries sent by a student's phone, so the coach can see progress. The phone keeps the
 * full sessions locally; the server keeps a summary per session (date, exercises, sets, weight, reps).
 */
export const SESSIONS_PER_REQUEST = 100;
const EXERCISES_MAX = 60;
const SETS_MAX = 100;
const STATUSES = ['active', 'completed', 'abandoned'] as const;

export type SessionStatus = (typeof STATUSES)[number];

export interface SummarySet {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
  notes: string;
  doneAt: string;
}

export interface SummaryExercise {
  exerciseId: string;
  sets: SummarySet[];
}

export interface WorkoutSummary {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  status: SessionStatus;
  notes: string;
  exercises: SummaryExercise[];
}

export async function migrateSessions(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS workout_sessions (
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      body TEXT NOT NULL,
      PRIMARY KEY (student_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS workout_sessions_by_student ON workout_sessions(student_id, started_at);
  `);
}

/** Text is trimmed and cut to the limit rather than rejected, so one long note cannot block a whole upload. */
function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** A number that is not finite becomes 0 and is kept inside the range. */
function number(value: unknown, min: number, max: number): number {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, parsed));
}

function isoTime(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function validateSet(raw: unknown): SummarySet {
  const set = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    setNumber: Math.round(number(set.setNumber, 0, 1000)),
    weightKg: number(set.weightKg, 0, 1000),
    reps: Math.round(number(set.reps, 0, 10000)),
    rir: number(set.rir, 0, 10),
    notes: text(set.notes, 300),
    doneAt: isoTime(set.doneAt) ?? '',
  };
}

function validateExercise(raw: unknown): SummaryExercise {
  const exercise = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const sets = Array.isArray(exercise.sets) ? exercise.sets.slice(0, SETS_MAX).map(validateSet) : [];
  return { exerciseId: text(exercise.exerciseId, 80), sets };
}

export function validateSummary(raw: unknown): WorkoutSummary {
  const session = requireObject(raw);
  const id = text(session.id, 100);
  const startedAt = isoTime(session.startedAt);
  if (!id || !startedAt) throw new HttpError(400, 'هر جلسه باید شناسه و زمان شروع داشته باشد.');
  const status = STATUSES.includes(session.status as SessionStatus) ? (session.status as SessionStatus) : 'active';
  const exercises = Array.isArray(session.exercises) ? session.exercises.slice(0, EXERCISES_MAX).map(validateExercise) : [];
  return {
    id,
    name: text(session.name, 120),
    startedAt,
    completedAt: isoTime(session.completedAt),
    status,
    notes: text(session.notes, 1000),
    exercises,
  };
}

export function validateSummaries(body: unknown): WorkoutSummary[] {
  const input = requireObject(body);
  const list = input.sessions;
  if (!Array.isArray(list) || list.length === 0 || list.length > SESSIONS_PER_REQUEST) {
    throw new HttpError(400, `هر بار می‌توانید ۱ تا ${SESSIONS_PER_REQUEST} جلسه بفرستید.`);
  }
  return list.map(validateSummary);
}

/** Saves summaries for one student. A session already on the server is replaced with the newer copy. Uses a single batch insert for speed. */
export async function saveSummaries(db: Db, studentId: number, summaries: WorkoutSummary[]): Promise<number> {
  if (summaries.length === 0) return 0;
  const values: unknown[] = [];
  const rows: string[] = [];
  for (let i = 0; i < summaries.length; i += 1) {
    const summary = summaries[i]!;
    const offset = i * 4;
    rows.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
    values.push(studentId, summary.id, summary.startedAt, JSON.stringify(summary));
  }
  await db.query(
    `INSERT INTO workout_sessions (student_id, session_id, started_at, body) VALUES ${rows.join(', ')}
     ON CONFLICT (student_id, session_id) DO UPDATE SET started_at = excluded.started_at, body = excluded.body`,
    values,
  );
  return summaries.length;
}

/** Full, versioned student sessions are authoritative; old summaries remain as a fallback. */
export async function listSummaries(db: Db, studentId: number): Promise<WorkoutSummary[]> {
  const [personal, legacy] = await Promise.all([
    db.query<{ body: string }>(
      `SELECT body FROM personal_data_records WHERE user_id = $1 AND kind = 'session' AND deleted = 0
       ORDER BY body::jsonb->>'startedAt' DESC LIMIT $2`, [studentId, SESSIONS_PER_REQUEST],
    ),
    db.query<{ body: string }>(
      `SELECT s.body FROM workout_sessions s WHERE s.student_id = $1
       AND NOT EXISTS (SELECT 1 FROM personal_data_records p WHERE p.user_id = s.student_id AND p.kind = 'session' AND p.item_key = s.session_id)
       ORDER BY s.started_at DESC LIMIT $2`, [studentId, SESSIONS_PER_REQUEST],
    ),
  ]);
  return [...personal.map((row) => validateSummary(JSON.parse(row.body))), ...legacy.map((row) => JSON.parse(row.body) as WorkoutSummary)]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, SESSIONS_PER_REQUEST);
}
