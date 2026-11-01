import type { Db } from './db.ts';

/**
 * Reports for the coach panel.
 *
 * The coach already sees every student, but the list alone does not say who stopped
 * training. This report answers that question with the data the app already stores:
 * the last workout session of each student and whether they still have a programme.
 */

/** A student counts as inactive when their last session is older than this. */
export const INACTIVE_DAYS = 7;

/** How many days of sessions history the report counts. */
export const ACTIVITY_WINDOW_DAYS = 30;

export interface InactiveStudent {
  id: number;
  displayName: string;
  username: string;
  /** When the student last trained; null when they never recorded a session. */
  lastSessionAt: string | null;
  /** Whole days since the last session; null when the student never trained. */
  daysSinceLastSession: number | null;
  /** Sessions in the last 30 days. */
  sessionsLast30Days: number;
  /** Whether the coach's programme is still assigned to the student. */
  hasProgramme: boolean;
}

interface InactiveRow {
  id: number;
  display_name: string;
  username: string;
  last_session_at: string | null;
  sessions_last_30_days: number;
  has_program: boolean;
}

/** Sessions live in two places: the synced personal records (authoritative) and the older summary table. */
const LAST_SESSION_SQL = `GREATEST(
  COALESCE((SELECT MAX(p.body::jsonb->>'startedAt') FROM personal_data_records p
            WHERE p.user_id = u.id AND p.kind = 'session' AND p.deleted = 0), ''),
  COALESCE((SELECT MAX(w.started_at) FROM workout_sessions w WHERE w.student_id = u.id), '')
)`;

const SESSIONS_IN_WINDOW_SQL = `(
  (SELECT COUNT(*) FROM personal_data_records p2 WHERE p2.user_id = u.id AND p2.kind = 'session' AND p2.deleted = 0
     AND p2.body::jsonb->>'startedAt' >= $2)
  +
  (SELECT COUNT(*) FROM workout_sessions w2 WHERE w2.student_id = u.id AND w2.started_at >= $2)
)`;

/**
 * The coach's students who did not train recently, the ones who never started first.
 */
export async function listInactiveStudents(db: Db, coachId: number, now = new Date()): Promise<InactiveStudent[]> {
  const windowStart = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db.query<InactiveRow>(
    `SELECT u.id, u.display_name, u.username,
       ${LAST_SESSION_SQL} AS last_session_at,
       ${SESSIONS_IN_WINDOW_SQL} AS sessions_last_30_days,
       EXISTS (SELECT 1 FROM student_programs sp WHERE sp.student_id = u.id) AS has_program
     FROM users u
     WHERE u.role = 'student' AND u.coach_id = $1 AND u.coach_access = 1
     ORDER BY last_session_at ASC NULLS FIRST, u.id ASC`,
    [coachId, windowStart],
  );
  return rows
    .map((row) => {
      const lastSessionAt = row.last_session_at ? row.last_session_at : null;
      const daysSinceLastSession = lastSessionAt ? wholeDaysBetween(lastSessionAt, now) : null;
      return {
        id: row.id,
        displayName: row.display_name,
        username: row.username,
        lastSessionAt,
        daysSinceLastSession,
        sessionsLast30Days: Number(row.sessions_last_30_days ?? 0),
        hasProgramme: Boolean(row.has_program),
      };
    })
    .filter((student) => student.daysSinceLastSession === null || student.daysSinceLastSession >= INACTIVE_DAYS);
}

/** Whole days between an ISO time and now; a time in the future counts as zero. */
function wholeDaysBetween(isoTime: string, now: Date): number {
  const then = Date.parse(isoTime);
  if (Number.isNaN(then)) return 0;
  const diff = now.getTime() - then;
  if (diff <= 0) return 0;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
