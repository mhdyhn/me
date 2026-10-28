// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

type Json = Record<string, any>;
let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-10-28T08:00:00Z');

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PAYMENT_PUBLIC_BASE_URL', '');
  vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
  vi.stubEnv('ZARINPAL_SANDBOX', 'true');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('practice-suite-secret') }));
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
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Json };
}

async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

async function createCoach(admin: string) {
  const created = await call('POST', '/api/coaches', { displayName: 'مربی آزمایشی' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function createStudent(coachToken: string) {
  const created = await call('POST', '/api/students', { displayName: 'شاگرد آزمایشی' }, coachToken);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function saveProgram(coachToken: string, studentId: number, priceTomans = 99999) {
  const saved = await call('PUT', `/api/students/${studentId}/program`, {
    title: 'برنامهٔ آزمایش', priceTomans,
    days: [{ name: 'روز اول', exercises: [{ exerciseId: 'bench-press', name: 'پرس سینه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
  }, coachToken);
  expect(saved.status).toBe(200);
  return saved.json.program as { id: string; version: number };
}

function request(program: { id: string; version: number }, studentId?: number) {
  return { expectedId: program.id, expectedVersion: program.version, ...(studentId === undefined ? {} : { studentId }) };
}

describe('read-only payment practice in production', () => {
  it('quotes the saved programme for the three roles without network, ledger writes or unlocking', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const snapshot = async () => ({
      payments: await db.query('SELECT * FROM payment_transactions ORDER BY id'),
      active: await db.query('SELECT * FROM student_programs ORDER BY student_id'),
      offers: await db.query('SELECT * FROM programme_offers ORDER BY id'),
    });
    const before = await snapshot();
    const nativeFetch = globalThis.fetch;
    const guardedFetch = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      if (!String(input).startsWith(base + '/')) throw new Error('Unexpected external request');
      return nativeFetch(input, init);
    });

    for (const token of [coach.token, admin]) {
      const result = await call('POST', '/api/pay/practice', request(program, student.id), token);
      expect(result.status).toBe(200);
      expect(result.json).toMatchObject({ simulation: true, programmeTitle: 'برنامهٔ آزمایش', amountTomans: 99999, coachShareTomans: 89999, adminShareTomans: 10000 });
      expect(result.json).not.toHaveProperty('authority');
      const sample = await call('POST', '/api/pay/practice', { sampleAmountTomans: 123456 }, token);
      expect(sample.status).toBe(200);
      expect(sample.json).toEqual({ simulation: true, programmeTitle: 'برنامهٔ نمونه', amountTomans: 123456, coachShareTomans: 111110, adminShareTomans: 12346 });
    }
    const studentQuote = await call('POST', '/api/pay/practice', request(program), student.token);
    expect(studentQuote.status).toBe(200);
    expect(studentQuote.json).toEqual({ simulation: true, programmeTitle: 'برنامهٔ آزمایش', amountTomans: 99999 });
    expect((await call('GET', '/api/me/program', undefined, student.token)).json).toMatchObject({ isPaid: false, program: { id: program.id, days: [] } });
    expect((await call('GET', '/api/me/programs/archive', undefined, student.token)).json.programs).toEqual([]);
    expect((await call('GET', '/api/coach/transactions', undefined, coach.token)).json.transactions).toEqual([]);
    expect((await call('GET', '/api/admin/transactions', undefined, admin)).json.transactions).toEqual([]);
    expect(await snapshot()).toEqual(before);
    expect(guardedFetch.mock.calls.every(([input]) => String(input).startsWith(base + '/'))).toBe(true);
  });

  it('rejects anonymous users, another coach and another student, as well as stale or invalid programmes', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const owner = await createCoach(admin);
    const other = await createCoach(admin);
    const student = await createStudent(owner.token);
    const foreignStudent = await createStudent(other.token);
    const program = await saveProgram(owner.token, student.id);
    expect((await call('POST', '/api/pay/practice', request(program, student.id))).status).toBe(401);
    expect((await call('POST', '/api/pay/practice', request(program, student.id), other.token)).status).toBe(404);
    expect((await call('POST', '/api/pay/practice', request(program, foreignStudent.id), student.token)).status).toBe(404);
    expect((await call('POST', '/api/pay/practice', request(program, student.id), foreignStudent.token)).status).toBe(404);
    expect((await call('POST', '/api/pay/practice', request(program), admin)).status).toBe(400);
    expect((await call('POST', '/api/pay/practice', { sampleAmountTomans: 100000 }, student.token)).status).toBe(403);
    for (const invalid of [0, -1, 2147483648, 1.5, '50000']) {
      expect((await call('POST', '/api/pay/practice', { sampleAmountTomans: invalid }, owner.token)).status).toBe(400);
    }
    expect((await call('POST', '/api/pay/practice', { ...request(program), expectedId: 'another-id' }, student.token)).status).toBe(409);
    expect((await call('POST', '/api/pay/practice', { ...request(program), expectedVersion: program.version + 1 }, student.token)).status).toBe(409);
    expect((await call('POST', '/api/pay/practice', { ...request(program), expectedVersion: -1 }, student.token)).status).toBe(409);
    expect((await call('POST', '/api/pay/practice', request(program), foreignStudent.token)).status).toBe(404);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('uses the configured split and rejects free programmes and invalid commission configuration', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    vi.stubEnv('COACH_COMMISSION_PERCENT', '75');
    expect((await call('POST', '/api/pay/practice', request(program, student.id), coach.token)).json)
      .toMatchObject({ amountTomans: 99999, coachShareTomans: 74999, adminShareTomans: 25000 });
    vi.stubEnv('COACH_COMMISSION_PERCENT', 'invalid');
    expect((await call('POST', '/api/pay/practice', request(program), student.token)).status).toBe(503);
    vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
    await db.query('UPDATE student_programs SET price_tomans = 0 WHERE student_id = $1', [student.id]);
    expect((await call('POST', '/api/pay/practice', request(program, student.id), coach.token)).status).toBe(400);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('keeps real checkout and fake verification closed when production configuration is absent', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const input = request(program);
    const practice = await call('POST', '/api/pay/practice', input, student.token);
    expect(practice.status).toBe(200);
    const missingOrigin = await call('POST', '/api/pay/start', input, student.token);
    expect(missingOrigin.status).toBe(503);
    expect(missingOrigin.json.error).toContain('پرداخت واقعی هنوز آماده نیست');
    expect((await call('POST', '/api/pay/start', input, coach.token)).status).toBe(403);
    expect((await call('POST', '/api/pay/start', input, admin)).status).toBe(403);
    vi.stubEnv('PAYMENT_PUBLIC_BASE_URL', 'https://example.com');
    expect((await call('POST', '/api/pay/start', input, student.token)).status).toBe(503);
    expect((await call('POST', '/api/pay/verify', { authority: 'SANDBOX-fake-123', status: 'OK' }, student.token)).status).toBe(404);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(false);
  });
});
