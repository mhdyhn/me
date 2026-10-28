// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createSession } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { findUserById, insertUser, type Role } from './users.ts';
import { saveStudentProfile, setStudentProfileSharing } from './studentProfile.ts';

let db: Db;
let server: Server;
let base: string;
let clock: Date;
const key = keyFromSecret('coach-invitation-test-secret');
type Session = { id: number; token: string };
const profile = { age: 28, sex: 'زن', heightCm: 168, weightKg: 64, primaryGoal: 'بهبود آمادگی', secondaryGoal: '', trainingExperience: 'تازه‌کار', trainingDays: 3, sessionMinutes: 45, dailyActivity: 'فعالیت سبک', sleepHours: '۷ ساعت', stressLevel: 0, injuries: 'بدون محدودیت', equipment: 'باشگاه کامل', workingWeightReferences: [] };

beforeEach(async () => {
  clock = new Date('2026-10-29T09:00:00.000Z');
  db = await openDatabase('memory');
  server = createServer(createApp({ db, secretKey: key, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

async function account(username: string, role: Role, coachId: number | null = null, selfRegistered = false): Promise<Session> {
  const id = await insertUser(db, { username, passwordHash: 'unused-in-test', role, displayName: username, coachId, selfRegistered, mustChangePassword: false, now: clock });
  const token = (await createSession(db, id, 0, clock))!;
  return { id, token };
}
async function call(method: string, path: string, body?: unknown, session?: Session) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any>, headers: response.headers };
}
const invite = (coach: Session) => call('POST', '/api/coach/invitations', {}, coach);
const preview = (student: Session, code: string, accountId = student.id) => call('POST', '/api/me/coach-invitation/preview', { accountId, code }, student);
const accept = (student: Session, code: string, accountId = student.id, consent = true) => call('POST', '/api/me/coach-invitation/accept', { accountId, code, consent }, student);
const withdraw = (student: Session, accountId = student.id) => call('POST', '/api/me/coach-access/withdraw', { accountId }, student);

describe('consent-based coach invitations', () => {
  it('requires the correct account and explicit consent, keeps the personal programme, and protects account ownership', async () => {
    const admin = await account('admin', 'admin');
    const coach = await account('coach-one', 'coach');
    const student = await account('independent-one', 'student', null, true);
    const otherCoach = await account('coach-other', 'coach');
    const personal = [{ id: 'personal-day', name: 'برنامه شخصی', focus: '', dayLabel: 'روز اول', durationMinutes: 30, description: '', exercises: [] }];
    const saved = await call('POST', '/api/me/personal-data/batch', { accountId: student.id, changes: [{ kind: 'program', key: 'main', baseVersion: 0, operationId: 'invitation-personal-01', deleted: false, value: personal }] }, student);
    expect(saved.json.results[0].status).toBe('saved');
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).status).toBe(404);
    expect((await call('POST', '/api/coach/invitations', {}, student)).status).toBe(403);
    const issued = await invite(coach);
    expect(issued.status).toBe(201);
    expect(issued.headers.get('cache-control')).toBe('no-store');
    const code = issued.json.code as string;
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const stored = await db.query('SELECT * FROM coach_invitations');
    expect(JSON.stringify(stored)).not.toContain(code);
    expect((await preview(student, code, student.id + 1)).status).toBe(409);
    expect((await preview(student, code)).json.coachName).toBe('coach-one');
    expect((await accept(student, code, student.id, false)).status).toBe(400);
    const connected = await accept(student, code);
    expect(connected).toMatchObject({ status: 200, json: { user: { id: student.id, coachId: coach.id, coachAccess: true, selfRegistered: true } } });
    expect(connected.json.user).not.toHaveProperty('coachAccessVersion');
    expect((await accept(student, code)).status).toBe(409);
    expect((await call('GET', '/api/students', undefined, coach)).json.students.map((item: { id: number }) => item.id)).toContain(student.id);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, otherCoach)).status).toBe(404);
    expect((await call('POST', `/api/students/${student.id}/reset-password`, {}, coach)).status).toBe(403);
    expect((await call('DELETE', `/api/students/${student.id}`, {}, coach)).status).toBe(403);
    expect((await call('PUT', `/api/students/${student.id}/active`, { active: false }, coach)).status).toBe(403);
    expect((await call('GET', `/api/me/personal-data?accountId=${student.id}`, undefined, student)).json.records.find((item: { kind: string }) => item.kind === 'program').value).toEqual(personal);
    expect((await call('GET', '/api/admin/students', undefined, admin)).json.students).toMatchObject([{ id: student.id, coachId: coach.id, selfRegistered: true }]);
  });

  it('withdraws access without deleting a paid programme or ledgers, then reconnects only the same coach without restoring profile consent', async () => {
    const admin = await account('admin', 'admin');
    const coach = await account('coach-one', 'coach');
    const other = await account('coach-two', 'coach');
    const student = await account('independent', 'student', null, true);
    expect((await accept(student, (await invite(coach)).json.code)).status).toBe(200);
    expect((await call('PUT', '/api/me/profile', { accountId: student.id, profile, shareWithCoach: true }, student)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(true);
    await db.query("INSERT INTO student_programs (student_id, coach_id, body, updated_at, price_tomans, programme_id, version) VALUES ($1, $2, $3, $4, 100, 'existing-offer', 1)", [student.id, coach.id, JSON.stringify({ title: 'برنامه موجود', days: [] }), clock.toISOString()]);
    await db.query("INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, programme_id, programme_mapping, gateway_mode) VALUES ($1, $2, 100, 90, 10, 'existing-authority', 'paid', 'real-ref', $3, 'existing-offer', 'explicit', 'production')", [student.id, coach.id, clock.toISOString()]);
    expect((await withdraw(student, student.id + 1)).status).toBe(409);
    const revoked = await withdraw(student);
    expect(revoked).toMatchObject({ status: 200, json: { user: { coachId: coach.id, coachAccess: false } } });
    expect((await call('GET', '/api/students', undefined, coach)).json.students).toEqual([]);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).status).toBe(404);
    expect((await call('POST', '/api/me/profile/sharing', { accountId: student.id, shareWithCoach: true }, student)).status).toBe(409);
    expect((await call('POST', '/api/me/chat', { text: 'سلام' }, student)).status).toBe(409);
    expect((await db.query('SELECT programme_id FROM student_programs WHERE student_id = $1', [student.id]))[0]).toMatchObject({ programme_id: 'existing-offer' });
    expect((await db.query('SELECT authority, status FROM payment_transactions WHERE student_id = $1', [student.id]))[0]).toMatchObject({ authority: 'existing-authority', status: 'paid' });
    expect((await call('GET', '/api/coach/transactions', undefined, coach)).json.transactions).toHaveLength(1);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.transactions).toHaveLength(1);
    expect((await call('GET', `/api/admin/coaches/${coach.id}/students`, undefined, admin)).json.students.map((item: { id: number }) => item.id)).toContain(student.id);
    const otherCode = (await invite(other)).json.code as string;
    expect((await preview(student, otherCode)).status).toBe(409);
    expect((await accept(student, otherCode)).status).toBe(409);
    const again = (await invite(coach)).json.code as string;
    expect((await preview(student, again)).status).toBe(200);
    expect((await accept(student, again)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json).toMatchObject({ shared: false, profile: null });
    expect((await call('POST', '/api/me/profile/sharing', { accountId: student.id, shareWithCoach: true }, student)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(true);
  });

  it('prevents stale profile requests from reviving consent after withdraw and reconnect', async () => {
    const coach = await account('coach', 'coach');
    const student = await account('independent', 'student', null, true);
    await accept(student, (await invite(coach)).json.code);
    const oldVersion = (await findUserById(db, student.id))!.coachAccessVersion;
    await call('PUT', '/api/me/profile', { accountId: student.id, profile, shareWithCoach: true }, student);
    await withdraw(student);
    await accept(student, (await invite(coach)).json.code);
    await expect(saveStudentProfile(db, student.id, profile, true, clock.toISOString(), oldVersion)).rejects.toMatchObject({ status: 409 });
    await expect(setStudentProfileSharing(db, student.id, true, clock.toISOString(), oldVersion)).rejects.toMatchObject({ status: 409 });
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(false);
  });

  it('expires and revokes codes, restricts them to self-registered students and enforces throttling', async () => {
    const coach = await account('coach', 'coach');
    const student = await account('independent', 'student', null, true);
    const manual = await account('manual', 'student', coach.id, false);
    const first = (await invite(coach)).json.code as string;
    expect((await preview(manual, first)).status).toBe(403);
    expect((await call('DELETE', '/api/coach/invitations', {}, coach)).status).toBe(200);
    expect((await preview(student, first)).status).toBe(400);
    const expiring = (await invite(coach)).json.code as string;
    clock = new Date(clock.getTime() + 48 * 60 * 60 * 1000);
    expect((await preview(student, expiring)).status).toBe(400);
    expect((await accept(student, expiring)).status).toBe(409);
    for (let i = 0; i < 19; i++) expect((await preview(student, 'x'.repeat(32))).status).toBe(400);
    expect((await preview(student, 'x'.repeat(32))).status).toBe(429);
  });

  it('blocks a synced active workout without consuming the code until the workout is completed', async () => {
    const coach = await account('coach', 'coach');
    const student = await account('independent', 'student', null, true);
    const code = (await invite(coach)).json.code as string;
    const session = { id: 'session-active', templateId: 'personal-day', name: 'تمرین', startedAt: clock.toISOString(), status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [] };
    const write = (value: unknown, baseVersion: number, operationId: string) => call('POST', '/api/me/personal-data/batch', { accountId: student.id, changes: [{ kind: 'session', key: session.id, baseVersion, operationId, deleted: false, value }] }, student);
    expect((await write(session, 0, 'active-session-01')).json.results[0].status).toBe('saved');
    const blocked = await accept(student, code);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toContain('تمرین فعال');
    expect((await findUserById(db, student.id))?.coachId).toBeNull();
    expect((await write({ ...session, status: 'completed' }, 1, 'finished-session-02')).json.results[0].status).toBe('saved');
    expect((await accept(student, code)).status).toBe(200);
  });

  it('consumes a code once under concurrent requests, and cannot attach two coaches to one student', async () => {
    const coach = await account('coach', 'coach');
    const other = await account('other', 'coach');
    const student1 = await account('student-one', 'student', null, true);
    const student2 = await account('student-two', 'student', null, true);
    const code = (await invite(coach)).json.code as string;
    const sameCode = await Promise.all([accept(student1, code), accept(student2, code)]);
    expect(sameCode.map((result) => result.status).sort()).toEqual([200, 409]);
    const unlinked = sameCode[0]!.status === 409 ? student1 : student2;
    const code1 = (await invite(coach)).json.code as string;
    const code2 = (await invite(other)).json.code as string;
    const twoCoaches = await Promise.all([accept(unlinked, code1), accept(unlinked, code2)]);
    expect(twoCoaches.map((result) => result.status).sort()).toEqual([200, 409]);
    const used = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM coach_invitations WHERE consumed_by = $1', [unlinked.id]);
    expect(used[0]!.n).toBe(1);
  });
});
