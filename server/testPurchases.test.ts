// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { migrateTestPurchases } from './testPurchases.ts';

type Json = Record<string, any>;
let db: Db;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PAYMENT_PUBLIC_BASE_URL', '');
  vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
  vi.stubEnv('ZARINPAL_SANDBOX', '');
  vi.stubEnv('STUDENT_TEST_PURCHASES', 'on');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  clock = new Date('2026-10-28T08:00:00Z');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('isolated-test-purchase-secret') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: await res.json() as Json };
}
async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}
async function createCoach(admin: string) {
  const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی آزمایش' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-test-pass-1' }, token);
  return { token, id: created.json.user.id as number };
}
async function createStudent(coach: string) {
  const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد آزمایش' }, coach);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-test-pass-1' }, token);
  return { token, id: created.json.user.id as number, username: created.json.username as string };
}
const programBody = {
  title: 'برنامهٔ پولی', priceTomans: 100000,
  days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }],
};
async function saveProgram(coach: string, student: number, extra: object = {}) {
  const res = await call('PUT', `/api/students/${student}/program`, { ...programBody, ...extra }, coach);
  expect(res.status).toBe(200);
  return res.json.program as { id: string; version: number };
}
const expected = (program: { id: string; version: number }) => ({ expectedId: program.id, expectedVersion: program.version });
const allow = (coach: string, student: number, program: { id: string; version: number }, enabled = true) =>
  call('PUT', `/api/students/${student}/test-purchase`, { enabled, ...expected(program) }, coach);
const start = (student: string, program: { id: string; version: number }) => call('POST', '/api/pay/test/start', expected(program), student);
const confirm = (student: string, authority: string, result: 'success' | 'cancel') => call('POST', '/api/pay/test/confirm', { authority, result }, student);

describe('explicit student test purchase in production', () => {
  it('lets one authorized student test-buy and open their programme across sessions, without real payment records', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const other = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const otherProgram = await saveProgram(coach.token, other.id);
    expect((await start(student.token, program)).status).toBe(409);
    expect((await allow(coach.token, student.id, program)).status).toBe(200);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: true, program: { days: [] } });
    expect((await start(other.token, otherProgram)).status).toBe(409);
    const checkout = await start(student.token, program);
    expect(checkout.status).toBe(201);
    expect(checkout.json).toMatchObject({ simulation: true, amountTomans: 100000 });
    expect(checkout.json.authority).toMatch(/^TEST-/);
    expect((await start(student.token, program)).json.authority).toBe(checkout.json.authority);
    const pendingReport = (await call('GET', '/api/coach/transactions', undefined, coach.token)).json;
    expect(pendingReport.transactions).toEqual([]);
    expect(pendingReport.testTransactions).toHaveLength(1);
    expect(pendingReport.testTransactions[0]).toMatchObject({
      simulation: true, status: 'pending', studentId: student.id, programmeId: program.id,
      programmeVersion: program.version, amountTomans: 100000, coachShareTomans: 90000, adminShareTomans: 10000,
      createdAt: clock.toISOString(), verifiedAt: null,
    });
    expect((await confirm(other.token, checkout.json.authority, 'success')).status).toBe(409);
    expect((await confirm(student.token, checkout.json.authority, 'success')).json).toMatchObject({ simulation: true, success: true });
    expect((await confirm(student.token, checkout.json.authority, 'cancel')).json.success).toBe(true);
    const view = await call('GET', '/api/me/program', undefined, student.token);
    expect(view.json).toMatchObject({ isPaid: false, isTestPurchase: true, program: { id: program.id } });
    expect(view.json.program.days[0].exercises[0].name).toBe('شنا');
    const secondDevice = await signIn(student.username, 'student-test-pass-1');
    expect((await call('GET', '/api/me/program', undefined, secondDevice)).json.isTestPurchase).toBe(true);
    expect((await call('GET', '/api/me/programs/archive', undefined, student.token)).json.programs).toEqual([]);
    const coachReport = (await call('GET', '/api/coach/transactions', undefined, coach.token)).json;
    const adminReport = (await call('GET', '/api/admin/transactions', undefined, admin)).json;
    expect(coachReport.transactions).toEqual([]);
    expect(adminReport.transactions).toEqual([]);
    expect(coachReport.testTransactions).toHaveLength(1);
    expect(adminReport.testTransactions).toEqual(coachReport.testTransactions);
    expect(coachReport.testTransactions[0]).toMatchObject({ status: 'paid', verifiedAt: clock.toISOString(), simulation: true, refId: null });
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
    expect((await call('POST', '/api/pay/verify', { authority: checkout.json.authority, status: 'OK' }, student.token)).status).toBe(404);
    expect((await call('POST', '/api/pay/start', expected(program), student.token)).status).toBe(503);
    expect((await allow(coach.token, student.id, program, false)).status).toBe(200);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { days: [] } });
    expect((await confirm(student.token, checkout.json.authority, 'success')).status).toBe(409);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions).toEqual(adminReport.testTransactions);
  });

  it('cancels without access, rejects stale checkout and keeps test access scoped to the purchased programme', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const first = await saveProgram(coach.token, student.id);
    await allow(coach.token, student.id, first);
    const canceled = await start(student.token, first);
    expect((await confirm(student.token, canceled.json.authority, 'cancel')).json.success).toBe(false);
    expect((await confirm(student.token, canceled.json.authority, 'success')).json.success).toBe(false);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.program.days).toEqual([]);
    const pending = await start(student.token, first);
    expect(pending.json.authority).not.toBe(canceled.json.authority);
    const edit = await saveProgram(coach.token, student.id, { title: 'ویرایش برنامه', saveMode: 'edit', ...expected(first) });
    const ended = (await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions.find((t: Json) => t.authority === pending.json.authority);
    expect(ended).toMatchObject({ status: 'expired', verifiedAt: null });
    expect((await confirm(student.token, pending.json.authority, 'success')).status).toBe(409);
    const current = await start(student.token, edit);
    expect((await confirm(student.token, current.json.authority, 'success')).json.success).toBe(true);
    const anotherEdit = await saveProgram(coach.token, student.id, { title: 'ویرایش رایگان', saveMode: 'edit', ...expected(edit) });
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, isTestPurchase: true, program: { id: first.id, title: 'ویرایش رایگان' } });
    const next = await saveProgram(coach.token, student.id, { title: 'برنامهٔ جدید', saveMode: 'new', ...expected(anotherEdit) });
    expect(next.id).not.toBe(first.id);
    const nextView = await call('GET', '/api/me/program', undefined, student.token);
    expect(nextView.json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { id: next.id, days: [] } });
    expect((await start(student.token, next)).status).toBe(409);
    expect((await call('GET', '/api/me/programs/archive', undefined, student.token)).json.programs).toEqual([]);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
    const history = (await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions;
    expect(history.map((t: Json) => t.status)).toEqual(['paid', 'canceled', 'canceled']);
    expect(history.filter((t: Json) => t.status === 'paid').reduce((sum: number, t: Json) => sum + t.amountTomans, 0)).toBe(100000);
  });

  it('clears test authorizations on startup with a merchant so they cannot revive later', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    await allow(coach.token, student.id, program);
    const checkout = await start(student.token, program);
    await confirm(student.token, checkout.json.authority, 'success');
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    await migrateTestPurchases(db);
    expect(await db.query('SELECT * FROM payment_test_purchases')).toEqual([]);
    vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { days: [] } });
  });

  it('requires the right coach, expires after 24 hours, and is disabled by a merchant or the kill switch', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const otherCoach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    expect((await allow(otherCoach.token, student.id, program)).status).toBe(404);
    expect((await allow(student.token, student.id, program)).status).toBe(403);
    expect((await call('PUT', `/api/students/${student.id}/test-purchase`, { enabled: true, ...expected(program) })).status).toBe(401);
    expect((await allow(admin, student.id, { ...program, version: program.version + 1 })).status).toBe(409);
    await allow(coach.token, student.id, program);
    const checkout = await start(student.token, program);
    await confirm(student.token, checkout.json.authority, 'success');
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'merchant-being-configured');
    const live = await call('GET', '/api/me/program', undefined, student.token);
    expect(live.json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { days: [] } });
    expect((await start(student.token, program)).status).toBe(503);
    expect((await allow(coach.token, student.id, program)).status).toBe(503);
    vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
    vi.stubEnv('STUDENT_TEST_PURCHASES', 'off');
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.program.days).toEqual([]);
    expect((await confirm(student.token, checkout.json.authority, 'success')).status).toBe(503);
    vi.stubEnv('STUDENT_TEST_PURCHASES', 'on');
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { days: [] } });
    expect((await confirm(student.token, checkout.json.authority, 'success')).status).toBe(409);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('lets only an admin enable a 24-hour global session, revokes it on stop and preserves financial history', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const otherCoach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const other = await createStudent(otherCoach.token);
    const program = await saveProgram(coach.token, student.id);
    const otherProgram = await saveProgram(otherCoach.token, other.id);
    expect((await call('GET', '/api/admin/payment-test-mode', undefined, admin)).json).toEqual({ available: true, enabled: false, expiresAt: null });
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, coach.token)).status).toBe(403);
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, student.token)).status).toBe(403);
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: 'true' }, admin)).status).toBe(400);
    expect((await start(student.token, program)).status).toBe(409);
    const activation = await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin);
    expect(activation.status).toBe(200);
    expect(activation.json).toEqual({ available: true, enabled: true, expiresAt: '2026-10-29T08:00:00.000Z' });
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: true, program: { days: [] } });
    const purchased = await start(student.token, program);
    const pending = await start(other.token, otherProgram);
    expect((await confirm(student.token, purchased.json.authority, 'success')).json.success).toBe(true);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isTestPurchase).toBe(true);
    const coachHistory = (await call('GET', '/api/coach/transactions', undefined, coach.token)).json.testTransactions;
    expect(coachHistory).toHaveLength(1);
    expect(coachHistory[0].studentId).toBe(student.id);
    expect((await call('GET', '/api/coach/transactions', undefined, otherCoach.token)).json.testTransactions[0].studentId).toBe(other.id);
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: false }, admin)).json.enabled).toBe(false);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: false, program: { days: [] } });
    expect((await confirm(other.token, pending.json.authority, 'success')).status).toBe(409);
    let history = (await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions;
    expect(history.map((t: Json) => t.status)).toEqual(['canceled', 'paid']);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.transactions).toEqual([]);
    // A fresh session must not revive a previous session's successful test purchase.
    await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, testPurchaseAvailable: true, program: { days: [] } });
    const newCheckout = await start(student.token, program);
    expect(newCheckout.json.authority).not.toBe(purchased.json.authority);
    expect((await confirm(student.token, newCheckout.json.authority, 'success')).json.success).toBe(true);
    await start(other.token, otherProgram);
    clock = new Date(clock.getTime() + 24 * 60 * 60 * 1000);
    expect((await call('GET', '/api/admin/payment-test-mode', undefined, admin)).json.enabled).toBe(false);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.program.days).toEqual([]);
    history = (await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions;
    expect(history.map((t: Json) => t.status)).toEqual(['expired', 'paid', 'canceled', 'paid']);
    expect(history[0].verifiedAt).toBeNull();
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('does not report that global mode is enabled if its database singleton is missing', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    await db.query('DELETE FROM payment_test_mode WHERE id = 1');
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin)).status).toBe(503);
    expect((await call('GET', '/api/admin/payment-test-mode', undefined, admin)).json.enabled).toBe(false);
  });

  it('snapshots the configured real commission and never rewrites it when a pending checkout is retried', async () => {
    vi.stubEnv('COACH_COMMISSION_PERCENT', '87.5');
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id, { priceTomans: 100001 });
    await allow(coach.token, student.id, program);
    const checkout = await start(student.token, program);
    vi.stubEnv('COACH_COMMISSION_PERCENT', '20');
    expect((await start(student.token, program)).json.authority).toBe(checkout.json.authority);
    await confirm(student.token, checkout.json.authority, 'success');
    const history = (await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ amountTomans: 100001, coachShareTomans: 87500, adminShareTomans: 12501, status: 'paid' });
  });

  it('attributes a test transaction to the assigned coach, as real checkout does, even with an old mismatched program row', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const otherCoach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    await db.query('UPDATE student_programs SET coach_id = $1 WHERE student_id = $2', [otherCoach.id, student.id]);
    await allow(coach.token, student.id, program);
    const checkout = await start(student.token, program);
    await confirm(student.token, checkout.json.authority, 'success');
    expect((await call('GET', '/api/coach/transactions', undefined, coach.token)).json.testTransactions[0]).toMatchObject({ coachId: coach.id, studentId: student.id });
    expect((await call('GET', '/api/coach/transactions', undefined, otherCoach.token)).json.testTransactions).toEqual([]);
  });

  it('does not invent financial history for pre-upgrade grants and requires a ledger record to confirm', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    await allow(coach.token, student.id, program);
    await db.query("UPDATE payment_test_purchases SET status = 'paid', amount_tomans = 100000 WHERE student_id = $1", [student.id]);
    await migrateTestPurchases(db);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions).toEqual([]);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isTestPurchase).toBe(true);
    await allow(coach.token, student.id, program);
    const checkout = await start(student.token, program);
    await db.query('DELETE FROM payment_test_transactions WHERE authority = $1', [checkout.json.authority]);
    expect((await confirm(student.token, checkout.json.authority, 'success')).status).toBe(409);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.program.days).toEqual([]);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('keeps individual grants distinct from global mode and disables mode on merchant startup', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    await allow(coach.token, student.id, program);
    await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin);
    const checkout = await start(student.token, program);
    await confirm(student.token, checkout.json.authority, 'success');
    await call('PUT', '/api/admin/payment-test-mode', { enabled: false }, admin);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isTestPurchase).toBe(true);
    await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin);
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    expect((await call('PUT', '/api/admin/payment-test-mode', { enabled: true }, admin)).status).toBe(503);
    await migrateTestPurchases(db);
    expect(await db.query('SELECT * FROM payment_test_purchases')).toEqual([]);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.testTransactions).toHaveLength(1);
    vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
    expect((await call('GET', '/api/admin/payment-test-mode', undefined, admin)).json.enabled).toBe(false);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.program.days).toEqual([]);
  });
});
