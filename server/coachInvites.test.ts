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
import { emptyPlan } from './nutrition.ts';
import { saveProgramme } from './programs.ts';

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

  it('withdraws access without deleting a paid programme or ledgers, then reconnects without restoring profile consent', async () => {
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
    expect((await preview(student, otherCode)).status).toBe(200);
    const again = (await invite(coach)).json.code as string;
    expect((await preview(student, again)).status).toBe(200);
    expect((await accept(student, again)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json).toMatchObject({ shared: false, profile: null });
    expect((await call('POST', '/api/me/profile/sharing', { accountId: student.id, shareWithCoach: true }, student)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(true);
  });

  it('returns to personal mode and changes coaches without sharing or destroying previous purchases, plans, settings or conversations', async () => {
    const admin = await account('admin', 'admin');
    const a = await account('coach-a', 'coach');
    const b = await account('coach-b', 'coach');
    const student = await account('student', 'student', null, true);
    const other = await account('other-student', 'student', null, true);
    const personal = [{ id: 'personal-day', name: 'برنامه شخصی', focus: '', dayLabel: 'روز اول', durationMinutes: 30, description: '', exercises: [] }];
    await call('POST', '/api/me/personal-data/batch', { accountId: student.id, changes: [{ kind: 'program', key: 'main', baseVersion: 0, operationId: 'personal-switch-01', deleted: false, value: personal }] }, student);
    await accept(student, (await invite(a)).json.code);
    const firstRelationship = (await findUserById(db, student.id))!.coachAccessVersion;
    await call('PUT', '/api/me/profile', { accountId: student.id, profile, shareWithCoach: true }, student);
    const input = { title: 'برنامه مربی الف', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
    const first = (await call('PUT', `/api/students/${student.id}/program`, input, a)).json.program;
    expect(first).toMatchObject({ title: input.title, version: 1 });
    await db.query("INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, programme_id, programme_mapping, gateway_mode) VALUES ($1, $2, 100000, 90000, 10000, 'paid-a', 'paid', 'real-ref', $3, $4, 'explicit', 'live')", [student.id, a.id, clock.toISOString(), first.id]);
    const diet = { ...emptyPlan(), targets: { kcal: 2100, proteinG: 120, carbsG: null, fatG: null } };
    expect((await call('PUT', `/api/students/${student.id}/nutrition`, diet, a)).status).toBe(200);
    expect((await call('PUT', `/api/students/${student.id}/ai-settings`, { age: 31, limitations: 'محدودیت خصوصی الف' }, a)).status).toBe(200);
    expect((await call('POST', `/api/students/${student.id}/chat`, { body: 'پیام خصوصی الف' }, a)).status).toBe(201);
    expect((await withdraw(student)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/program`, undefined, a)).status).toBe(404);
    const activated = await call('POST', '/api/me/personal-program/activate', { accountId: student.id }, student);
    expect(activated).toMatchObject({ status: 200, json: { user: { coachId: a.id, coachAccess: false, personalProgramMode: true } } });
    expect((await call('GET', '/api/me/program', undefined, student)).json.program).toBeNull();
    expect((await call('GET', `/api/me/personal-data?accountId=${student.id}`, undefined, student)).json.records.find((item: { kind: string }) => item.kind === 'program').value).toEqual(personal);
    expect((await call('GET', '/api/me/programs/archive', undefined, student)).json.programs[0]).toMatchObject({ id: first.id, title: input.title });
    const nextCode = (await invite(b)).json.code as string;
    expect((await preview(student, nextCode)).json.coachName).toBe('coach-b');
    expect((await accept(student, nextCode)).json.user).toMatchObject({ coachId: b.id, coachAccess: true, personalProgramMode: false });
    expect((await call('GET', `/api/students/${student.id}/program`, undefined, b)).json.program).toBeNull();
    expect((await call('GET', `/api/students/${student.id}/programs/archive`, undefined, b)).json.programs).toEqual([]);
    expect((await call('POST', `/api/students/${student.id}/programs/restore`, { offerId: first.id, offerVersion: 1, expectedId: null, expectedVersion: 0 }, b)).status).toBe(409);
    expect((await call('GET', '/api/me/program', undefined, student)).json.program).toBeNull();
    expect((await call('GET', `/api/students/${student.id}/nutrition`, undefined, b)).json.plan.targets.kcal).toBeNull();
    expect((await call('GET', `/api/students/${student.id}/ai-settings`, undefined, b)).json.biometrics.limitations).toBe('');
    expect((await call('GET', `/api/students/${student.id}/chat`, undefined, b)).json.messages).toEqual([]);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, b)).json).toMatchObject({ shared: false, profile: null });
    expect((await call('GET', '/api/me/nutrition/archive', undefined, b)).status).toBe(403);
    expect((await call('GET', `/api/me/chat/archive/${a.id}`, undefined, other)).status).toBe(404);
    const archivedDiet = (await call('GET', '/api/me/nutrition/archive', undefined, student)).json.plans;
    expect(archivedDiet).toMatchObject([{ coachId: a.id, plan: { targets: { kcal: 2100 } } }]);
    const archivedHealth = (await call('GET', '/api/me/ai-settings/archive', undefined, student)).json.records;
    expect(archivedHealth).toMatchObject([{ coachId: a.id, biometrics: { limitations: 'محدودیت خصوصی الف' } }]);
    expect((await call('GET', '/api/me/chat/archive', undefined, student)).json.threads).toMatchObject([{ coachId: a.id }]);
    expect((await call('GET', `/api/me/chat/archive/${a.id}`, undefined, student)).json.messages[0].body).toBe('پیام خصوصی الف');
    const second = await call('PUT', `/api/students/${student.id}/program`, { ...input, title: 'برنامه مربی ب', priceTomans: 0 }, b);
    expect(second.status).toBe(200);
    expect(second.json.program.id).not.toBe(first.id);
    expect((await call('GET', '/api/me/program', undefined, student)).json.program.title).toBe('برنامه مربی ب');
    expect((await call('GET', '/api/me/programs/archive', undefined, student)).json.programs[0].id).toBe(first.id);
    expect((await call('PUT', `/api/students/${student.id}/nutrition`, { ...diet, targets: { ...diet.targets, kcal: 1800 } }, b)).status).toBe(200);
    expect((await call('PUT', `/api/students/${student.id}/ai-settings`, { age: 28, limitations: 'اطلاعات ب' }, b)).status).toBe(200);
    expect((await call('GET', '/api/me/nutrition/archive', undefined, student)).json.plans[0].plan.targets.kcal).toBe(2100);
    expect((await call('GET', '/api/me/ai-settings/archive', undefined, student)).json.records[0].biometrics.limitations).toBe('محدودیت خصوصی الف');
    expect((await call('GET', '/api/coach/transactions', undefined, a)).json.transactions).toMatchObject([{ coachId: a.id, status: 'paid' }]);
    expect((await call('GET', '/api/coach/transactions', undefined, b)).json.transactions).toEqual([]);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.transactions).toHaveLength(1);
    await expect(saveProgramme(db, student.id, a.id, input, { mode: 'edit', expectedId: first.id, expectedVersion: first.version }, clock, firstRelationship)).rejects.toMatchObject({ status: 409 });
    await withdraw(student);
    expect((await accept(student, (await invite(a)).json.code)).status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/nutrition`, undefined, a)).json.plan.targets.kcal).toBe(2100);
    expect((await call('GET', `/api/students/${student.id}/ai-settings`, undefined, a)).json.biometrics.limitations).toBe('محدودیت خصوصی الف');
    expect((await call('GET', `/api/students/${student.id}/chat`, undefined, a)).json.messages[0].body).toBe('پیام خصوصی الف');
    const offers = (await call('GET', `/api/students/${student.id}/programs/archive`, undefined, a)).json.programs;
    expect(offers).toMatchObject([{ id: first.id, title: input.title }]);
    const restoreInput = { offerId: first.id, offerVersion: offers[0].version, expectedId: null, expectedVersion: 0 };
    const restored = await call('POST', `/api/students/${student.id}/programs/restore`, restoreInput, a);
    expect(restored).toMatchObject({ status: 200, json: { program: { id: first.id, version: 2147483648 } } });
    expect((await call('GET', '/api/me/program', undefined, student)).json).toMatchObject({ isPaid: true, program: { id: first.id } });
    expect((await call('POST', `/api/students/${student.id}/programs/restore`, restoreInput, a)).status).toBe(409);
    const edited = await call('PUT', `/api/students/${student.id}/program`, { ...input, title: 'ویرایش رایگان', saveMode: 'edit', expectedId: first.id, expectedVersion: restored.json.program.version }, a);
    expect(edited).toMatchObject({ status: 200, json: { program: { id: first.id, version: 2147483649 } } });
    expect((await call('GET', '/api/me/program', undefined, student)).json).toMatchObject({ isPaid: true, program: { id: first.id, title: 'ویرایش رایگان' } });
    expect((await call('GET', '/api/me/programs/archive', undefined, student)).json.programs).toMatchObject([{ id: second.json.program.id }]);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.transactions).toHaveLength(1);
  }, 30000);

  it('applies a late sandbox callback to the old offer and original coach after a coach change', async () => {
    const a = await account('coach-a', 'coach');
    const b = await account('coach-b', 'coach');
    const student = await account('student', 'student', null, true);
    await accept(student, (await invite(a)).json.code);
    const input = { title: 'خرید در جریان', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
    const first = (await call('PUT', `/api/students/${student.id}/program`, input, a)).json.program;
    const checkout = await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, student);
    expect(checkout.status).toBe(201);
    await withdraw(student);
    await accept(student, (await invite(b)).json.code);
    expect((await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, student)).status).not.toBe(201);
    const second = (await call('PUT', `/api/students/${student.id}/program`, { ...input, title: 'برنامه جدید', priceTomans: 200000 }, b)).json.program;
    const result = await call('POST', '/api/pay/verify', { authority: checkout.json.authority, status: 'OK' }, student);
    expect(result.json).toMatchObject({ success: true, transaction: { coachId: a.id, studentId: student.id } });
    expect(result.json.message).toContain('بایگانی');
    expect((await call('GET', '/api/me/program', undefined, student)).json).toMatchObject({ isPaid: false, program: { id: second.id, days: [] } });
    expect((await call('GET', '/api/me/programs/archive', undefined, student)).json.programs).toMatchObject([{ id: first.id }]);
  });

  it('keeps test access explicitly temporary in the archive after switching to a personal programme', async () => {
    const coach = await account('coach', 'coach');
    const student = await account('student', 'student', null, true);
    await accept(student, (await invite(coach)).json.code);
    const input = { title: 'برنامه آزمایشی', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
    const program = (await call('PUT', `/api/students/${student.id}/program`, input, coach)).json.program;
    const expected = { expectedId: program.id, expectedVersion: program.version };
    expect((await call('PUT', `/api/students/${student.id}/test-purchase`, { enabled: true, ...expected }, coach)).status).toBe(200);
    const checkout = await call('POST', '/api/pay/test/start', expected, student);
    expect(checkout.status).toBe(201);
    expect((await call('POST', '/api/pay/test/confirm', { authority: checkout.json.authority, result: 'success' }, student)).json.success).toBe(true);
    await withdraw(student);
    await call('POST', '/api/me/personal-program/activate', { accountId: student.id }, student);
    const archive = (await call('GET', '/api/me/programs/archive', undefined, student)).json.programs;
    expect(archive).toMatchObject([{ id: program.id, isTestPurchase: true, testPurchaseExpiresAt: expect.any(String) }]);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    expect((await call('GET', '/api/me/programs/archive', undefined, student)).json.programs).toEqual([]);
  });

  it('allows immediate withdrawal during a workout but blocks the personal-programme switch until it is synced and finished', async () => {
    const coach = await account('coach', 'coach');
    const student = await account('student', 'student', null, true);
    await accept(student, (await invite(coach)).json.code);
    const session = { id: 'in-progress', templateId: 'assigned-day-1', name: 'تمرین', startedAt: clock.toISOString(), status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [] };
    const write = (value: unknown, baseVersion: number, operationId: string) => call('POST', '/api/me/personal-data/batch', { accountId: student.id, changes: [{ kind: 'session', key: session.id, baseVersion, operationId, deleted: false, value }] }, student);
    expect((await write(session, 0, 'switch-session-active')).json.results[0].status).toBe('saved');
    expect((await withdraw(student)).status).toBe(200);
    const blocked = await call('POST', '/api/me/personal-program/activate', { accountId: student.id }, student);
    expect(blocked.status).toBe(409);
    expect(blocked.json.error).toContain('تمرین فعال');
    expect((await write({ ...session, status: 'completed' }, 1, 'switch-session-finished')).json.results[0].status).toBe('saved');
    expect((await call('POST', '/api/me/personal-program/activate', { accountId: student.id }, student)).status).toBe(200);
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

describe('reusable coach registration link', () => {
  it('provides a stable link, needs consent and supports multiple self-registered students without consuming it', async () => {
    const coach = await account('coach-link', 'coach');
    const first = await account('link-student-one', 'student', null, true);
    const second = await account('link-student-two', 'student', null, true);
    const manual = await account('manual-student', 'student');
    expect((await call('POST', '/api/coach/registration-link', { accountId: coach.id + 1 }, coach)).status).toBe(409);
    const created = await call('POST', '/api/coach/registration-link', { accountId: coach.id }, coach);
    expect(created.status).toBe(200);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const token = created.json.token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(await db.query('SELECT * FROM coach_registration_links'))).not.toContain(token);
    expect((await call('POST', '/api/coach/registration-link', { accountId: coach.id }, coach)).json.token).toBe(token);
    expect((await call('POST', '/api/coach-registration-link/preview', { token })).json).toEqual({ coachId: coach.id, coachName: 'coach-link' });
    const acceptLink = (session: Session, consent = true, accountId = session.id) => call('POST', '/api/me/coach-registration-link/accept', { token, accountId, consent }, session);
    expect((await acceptLink(first, false)).status).toBe(400);
    expect((await acceptLink(first, true, second.id)).status).toBe(409);
    expect((await acceptLink(manual)).status).toBe(403);
    expect((await acceptLink(first)).json.user).toMatchObject({ id: first.id, coachId: coach.id, coachAccess: true });
    expect((await acceptLink(second)).json.user).toMatchObject({ id: second.id, coachId: coach.id, coachAccess: true });
    expect((await call('GET', '/api/students', undefined, coach)).json.students.map((s: { id: number }) => s.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect((await acceptLink(first)).status).toBe(409);
    expect((await call('POST', '/api/coach-registration-link/preview', { token })).status).toBe(200);
    expect((await call('DELETE', '/api/coach/registration-link', { accountId: coach.id }, coach)).status).toBe(200);
    expect((await call('POST', '/api/coach-registration-link/preview', { token })).status).toBe(404);
    expect((await findUserById(db, first.id))?.coachId).toBe(coach.id);
    const renewed = await call('POST', '/api/coach/registration-link', { accountId: coach.id }, coach);
    expect(renewed.json.token).not.toBe(token);
  });
  it('does not connect already-connected accounts or grant access through an inactive coach', async () => {
    const coach = await account('coach-link', 'coach');
    const other = await account('coach-other-link', 'coach');
    const student = await account('connected-link-student', 'student', other.id, true);
    const token = (await call('POST', '/api/coach/registration-link', { accountId: coach.id }, coach)).json.token as string;
    const attempt = () => call('POST', '/api/me/coach-registration-link/accept', { token, accountId: student.id, consent: true }, student);
    expect((await attempt()).status).toBe(409);
    expect((await findUserById(db, student.id))?.coachId).toBe(other.id);
    await db.query('UPDATE users SET is_active = 0 WHERE id = $1', [coach.id]);
    expect((await call('POST', '/api/coach-registration-link/preview', { token })).status).toBe(404);
    expect((await attempt()).status).toBe(409);
  });
});
