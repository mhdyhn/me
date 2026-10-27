// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

type Json = Record<string, any>;

let db: Db;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  db = await openDatabase('memory');
  clock = new Date('2026-10-13T08:00:00Z');
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

/** A coach with one student who has already chosen a password. */
async function coachAndStudent() {
  const admin = await login('owner', 'owner-pass-123');
  const coach = await call('POST', '/api/coaches', { displayName: 'مربی یک' }, admin);
  let coachToken = await login(coach.json.username, coach.json.password);
  await call('POST', '/api/me/password', { currentPassword: coach.json.password, newPassword: 'coach-new-pass-1' }, coachToken);
  coachToken = await login(coach.json.username, 'coach-new-pass-1');

  const created = await call('POST', '/api/students', { displayName: 'شاگرد یک' }, coachToken);
  let studentToken = await login(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-1' }, studentToken);
  studentToken = await login(created.json.username, 'student-new-pass-1');
  return { admin, coachToken, studentToken, studentId: created.json.user.id as number };
}

function session(id: string, overrides: Partial<Json> = {}): Json {
  return {
    id,
    templateId: 'push-day',
    name: 'روز پوش',
    startedAt: '2026-10-12T17:00:00.000Z',
    completedAt: '2026-10-12T18:05:00.000Z',
    status: 'completed',
    notes: '',
    exercises: [
      {
        exerciseId: 'flat-dumbbell-press',
        sets: [{ setNumber: 1, weightKg: 22.5, reps: 10, rir: 2, notes: '', doneAt: '2026-10-12T17:10:00.000Z' }],
      },
    ],
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    ...overrides,
  };
}

describe('workout summaries', () => {
  it('lets the student send sessions and the coach read them, newest first', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    const older = session('s-1', { startedAt: '2026-10-10T17:00:00.000Z' });
    const newer = session('s-2', { startedAt: '2026-10-12T17:00:00.000Z', status: 'abandoned', completedAt: undefined });
    const sent = await call('PUT', '/api/me/sessions', { sessions: [older, newer] }, studentToken);
    expect(sent.status).toBe(200);
    expect(sent.json.saved).toBe(2);

    const read = await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken);
    expect(read.status).toBe(200);
    expect(read.json.studentName).toBe('شاگرد یک');
    const ids = read.json.sessions.map((s: Json) => s.id);
    expect(ids).toEqual(['s-2', 's-1']);
    expect(read.json.sessions[1]).toMatchObject({
      name: 'روز پوش',
      status: 'completed',
      completedAt: '2026-10-12T18:05:00.000Z',
      exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [{ setNumber: 1, weightKg: 22.5, reps: 10, rir: 2 }] }],
    });
    expect(read.json.sessions[0].status).toBe('abandoned');
    expect(read.json.sessions[0].completedAt).toBeNull();
  });

  it('replaces a session with the newer copy when the same id is sent again', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    await call('PUT', '/api/me/sessions', { sessions: [session('s-1', { status: 'active', completedAt: undefined })] }, studentToken);
    await call('PUT', '/api/me/sessions', { sessions: [session('s-1')] }, studentToken);
    const read = await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken);
    expect(read.json.sessions).toHaveLength(1);
    expect(read.json.sessions[0].status).toBe('completed');
  });

  it('keeps the coach out of the student upload, and the student out of the coach view', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    expect((await call('PUT', '/api/me/sessions', { sessions: [session('s-1')] }, coachToken)).status).toBe(403);
    expect((await call('GET', `/api/students/${studentId}/sessions`, undefined, studentToken)).status).toBe(403);
  });

  it("hides another coach's student and the admin gets no student view", async () => {
    const { admin, coachToken, studentId } = await coachAndStudent();
    const other = await call('POST', '/api/coaches', { displayName: 'مربی دو' }, admin);
    const otherToken = await login(other.json.username, other.json.password);
    await call('POST', '/api/me/password', { currentPassword: other.json.password, newPassword: 'coach-two-pass-1' }, otherToken);
    const otherLogin = await login(other.json.username, 'coach-two-pass-1');
    expect((await call('GET', `/api/students/${studentId}/sessions`, undefined, otherLogin)).status).toBe(404);
    expect((await call('GET', `/api/students/${studentId}/sessions`, undefined, admin)).status).toBe(403);
    expect((await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken)).status).toBe(200);
  });

  it('rejects a batch without ids or start times, and an oversized batch', async () => {
    const { studentToken } = await coachAndStudent();
    expect((await call('PUT', '/api/me/sessions', { sessions: [{ name: 'بدون شناسه', startedAt: '2026-10-12T17:00:00.000Z' }] }, studentToken)).status).toBe(400);
    expect((await call('PUT', '/api/me/sessions', { sessions: [session('s-1', { startedAt: 'not a date' })] }, studentToken)).status).toBe(400);
    expect((await call('PUT', '/api/me/sessions', { sessions: [] }, studentToken)).status).toBe(400);
    const tooMany = Array.from({ length: 101 }, (_, i) => session(`s-${i}`));
    expect((await call('PUT', '/api/me/sessions', { sessions: tooMany }, studentToken)).status).toBe(400);
  });

  it('accepts a batch of 20 real-sized sessions, which the normal 16 KB body limit would refuse', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    const sets = Array.from({ length: 5 }, (_, i) => ({ setNumber: i + 1, weightKg: 40, reps: 8, rir: 1, notes: 'کمی سخت بود', doneAt: '2026-10-12T17:10:00.000Z' }));
    const exercises = Array.from({ length: 6 }, (_, i) => ({ exerciseId: `exercise-${i}`, sets }));
    const batch = Array.from({ length: 20 }, (_, i) => session(`big-${i}`, { exercises, notes: 'یادداشت '.repeat(50) }));
    expect(JSON.stringify({ sessions: batch }).length).toBeGreaterThan(16 * 1024);
    const sent = await call('PUT', '/api/me/sessions', { sessions: batch }, studentToken);
    expect(sent.status).toBe(200);
    const read = await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken);
    expect(read.json.sessions).toHaveLength(20);
  });

  it('shows versioned sessions to the coach and does not resurrect a deleted legacy summary', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    const legacy = session('versioned-one');
    await call('PUT', '/api/me/sessions', { sessions: [legacy, session('legacy-only')] }, studentToken);
    const full = { ...legacy, templateId: 'day-1', currentExerciseIndex: 0, currentSetIndex: 0, name: 'نسخهٔ تازه', notes: '', exercises: [] };
    const change = (version: number, deleted: boolean, value: unknown, operationId: string) => ({ kind: 'session', key: 'versioned-one', baseVersion: version, deleted, value, operationId });
    const write = (item: unknown) => call('POST', '/api/me/personal-data/batch', { changes: [item] }, studentToken);
    expect((await write(change(0, false, full, 'session-write-01'))).json.results[0].status).toBe('saved');
    await call('PUT', '/api/me/sessions', { sessions: [legacy] }, studentToken);
    const first = (await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken)).json.sessions;
    expect(first.find((item: { id: string }) => item.id === 'versioned-one').name).toBe('نسخهٔ تازه');
    expect(first.some((item: { id: string }) => item.id === 'legacy-only')).toBe(true);
    expect((await write(change(1, true, null, 'session-delete-02'))).json.results[0].status).toBe('saved');
    const after = (await call('GET', `/api/students/${studentId}/sessions`, undefined, coachToken)).json.sessions;
    expect(after.some((item: { id: string }) => item.id === 'versioned-one')).toBe(false);
    expect(after.some((item: { id: string }) => item.id === 'legacy-only')).toBe(true);
  });

  it('removes a deleted student\'s sessions with the account', async () => {
    const { coachToken, studentToken, studentId } = await coachAndStudent();
    await call('PUT', '/api/me/sessions', { sessions: [session('s-1')] }, studentToken);
    expect((await call('DELETE', `/api/students/${studentId}`, undefined, coachToken)).status).toBe(200);
    const rows = await db.query('SELECT COUNT(*) AS n FROM workout_sessions WHERE student_id = $1', [studentId]);
    expect(Number(rows[0]!.n)).toBe(0);
  });
});
