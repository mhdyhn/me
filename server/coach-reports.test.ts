// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

/** A fresh mobile number for every account: one number belongs to one account only. */
let phoneSequence = 0;
function nextPhone(): string {
  phoneSequence += 1;
  return `0912${String(1230000 + phoneSequence)}`;
}

type Json = Record<string, any>;

let db: Db;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  db = await openDatabase('memory');
  clock = new Date('2026-11-01T08:00:00Z');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('test-secret-for-the-suite') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Json };
}

async function login(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

/** A coach with a fresh student; returns the tokens and ids of both. */
async function coachWithStudent(displayName: string): Promise<{
  coachToken: string;
  coachId: number;
  studentId: number;
  studentUsername: string;
  studentPassword: string;
}> {
  const admin = await login('owner', 'owner-pass-123');
  const coach = await call('POST', '/api/coaches', { phoneNumber: nextPhone(), displayName: 'مربی گزارش' }, admin);
  let coachToken = await login(coach.json.username, coach.json.password);
  // The coach sets their own password before the app lets them work with students.
  await call('POST', '/api/me/password', { currentPassword: coach.json.password, newPassword: 'coach-pass-for-report' }, coachToken);
  coachToken = await login(coach.json.username, 'coach-pass-for-report');
  const created = await call('POST', '/api/students', { phoneNumber: nextPhone(), displayName }, coachToken);
  return {
    coachToken,
    coachId: coach.json.user.id as number,
    studentId: created.json.user.id as number,
    studentUsername: created.json.username as string,
    studentPassword: created.json.password as string,
  };
}

/** A session in the older summary table. */
async function insertSummary(studentId: number, id: string, startedAt: string): Promise<void> {
  const body = JSON.stringify({ id, name: 'جلسه', startedAt, status: 'completed', notes: '', exercises: [] });
  await db.query(
    'INSERT INTO workout_sessions (student_id, session_id, started_at, body) VALUES ($1, $2, $3, $4)',
    [studentId, id, startedAt, body],
  );
}

/** A session in the synced personal records (the authoritative copy). */
async function insertPersonalSession(studentId: number, id: string, startedAt: string): Promise<void> {
  const body = JSON.stringify({ id, templateId: 'day-1', name: 'جلسه', startedAt, status: 'completed', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [] });
  await db.query(
    `INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
     VALUES ($1, 'session', $2, 1, $3, 0, $4, $5)`,
    [studentId, id, body, startedAt, `test-${id}`],
  );
}

describe('the coach report of inactive students', () => {
  it('lists the students who did not train recently and leaves the active ones out', async () => {
    const { coachToken, studentId } = await coachWithStudent('شاگرد غایب');
    const { studentId: activeId } = await coachWithStudent('شاگرد فعال');
    await insertSummary(studentId, 'old-session', '2026-10-20T08:00:00.000Z');
    await insertSummary(activeId, 'fresh-session', '2026-10-31T08:00:00.000Z');

    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    expect(response.status).toBe(200);
    expect(response.json.inactiveDays).toBe(7);
    const names = response.json.students.map((student: Json) => student.displayName);
    expect(names).toEqual(['شاگرد غایب']);
    const report = response.json.students[0] as Json;
    expect(report.daysSinceLastSession).toBe(12);
    expect(report.lastSessionAt).toBe('2026-10-20T08:00:00.000Z');
    expect(report.sessionsLast30Days).toBe(1);
    expect(report.hasProgramme).toBe(false);
  });

  it('counts a student who never trained as inactive without a date', async () => {
    const { coachToken, studentId } = await coachWithStudent('شاگرد تازه');
    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    expect(response.status).toBe(200);
    const report = (response.json.students as Json[]).find((student) => student.id === studentId);
    expect(report).toBeDefined();
    expect(report!.daysSinceLastSession).toBeNull();
    expect(report!.lastSessionAt).toBeNull();
    expect(report!.sessionsLast30Days).toBe(0);
  });

  it('reads the sessions of the synced personal records too', async () => {
    const { coachToken, studentId } = await coachWithStudent('شاگلد همگام');
    await insertPersonalSession(studentId, 'personal-session', '2026-10-15T08:00:00.000Z');
    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    const report = (response.json.students as Json[]).find((student) => student.id === studentId);
    expect(report).toBeDefined();
    expect(report!.daysSinceLastSession).toBe(17);
    expect(report!.sessionsLast30Days).toBe(1);
  });

  it('tells the coach whether the programme is still assigned', async () => {
    const { coachToken, coachId, studentId } = await coachWithStudent('شاگرد با برنامه');
    await db.query(
      'INSERT INTO student_programs (student_id, coach_id, body, updated_at) VALUES ($1, $2, $3, $4)',
      [studentId, coachId, JSON.stringify([{ id: 'day-1', name: 'روز', focus: 'پا', dayLabel: 'شنبه', durationMinutes: 30, description: '', exercises: [] }]), '2026-11-01T08:00:00.000Z'],
    );
    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    const report = (response.json.students as Json[]).find((student) => student.id === studentId);
    expect(report!.hasProgramme).toBe(true);
  });

  it('keeps the students of other coaches out of the report', async () => {
    const { coachToken } = await coachWithStudent('شاگرد خودی');
    const other = await coachWithStudent('شاگرد دیگری');
    expect(other.studentId).toBeGreaterThan(0);
    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    const ids = (response.json.students as Json[]).map((student) => student.id);
    expect(ids).not.toContain(other.studentId);
  });

  it('keeps a student who took back the coach access out of the report', async () => {
    const { coachToken, studentId } = await coachWithStudent('شاگرد قطع‌کننده');
    await db.query('UPDATE users SET coach_access = 0 WHERE id = $1', [studentId]);
    const response = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    const ids = (response.json.students as Json[]).map((student) => student.id);
    expect(ids).not.toContain(studentId);
  });

  it('does not let a student read the report of the coach', async () => {
    const { coachToken, studentUsername, studentPassword } = await coachWithStudent('شاگرد معمولی');
    const studentToken = await login(studentUsername, studentPassword);
    const response = await call('GET', '/api/coach/inactive-students', undefined, studentToken);
    expect(response.status).toBe(403);
    const coachResponse = await call('GET', '/api/coach/inactive-students', undefined, coachToken);
    expect(coachResponse.status).toBe(200);
  });
});
