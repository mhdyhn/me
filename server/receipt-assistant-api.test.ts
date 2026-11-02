// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { createSession } from './auth.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { insertUser } from './users.ts';

let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-10-30T08:00:00Z');
const CARD = '6037999912345678';

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', CARD);
  vi.stubEnv('CARD_TRANSFER_CARD_HOLDER', 'شرکت میتی');
  vi.stubEnv('CARD_TRANSFER_EXPIRY_HOURS', '72');
  vi.stubEnv('CARD_TRANSFER_MAX_PER_DAY', '3');
  vi.stubEnv('CARD_TRANSFER_UNIQUE_AMOUNT', 'on');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('receipt-assistant-suite-secret') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
}

/** The call with the token of a session object. */
async function callAs(method: string, path: string, body: unknown, session: { token: string }) {
  return call(method, path, body, session.token);
}

async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

/** A student without a coach, so the paid plans are on sale for him. */
async function studentAccount(username: string): Promise<{ id: number; token: string }> {
  const id = await insertUser(db, {
    username, passwordHash: 'unused-in-test', role: 'student', displayName: username,
    coachId: null, selfRegistered: true, mustChangePassword: false, now: clock,
  });
  const token = (await createSession(db, id, 0, clock))!;
  return { id, token };
}

/** A subscription receipt that waits for the manager to look at it. */
async function pendingSubscription(trackingNumber: string): Promise<{ authority: string; amount: number }> {
  const student = await studentAccount(`student-${trackingNumber}`);
  const checkout = await callAs('POST', '/api/me/subscription/checkout', { planId: 'basic' }, student);
  expect(checkout.status).toBe(201);
  await callAs('POST', '/api/me/subscription/receipt', { authority: checkout.json.authority, trackingNumber }, student);
  return { authority: checkout.json.authority, amount: checkout.json.transferAmountTomans };
}

describe('the receipt assistant of the manager', () => {
  it('reads the statement and says which receipt it belongs to', async () => {
    const adminToken = await signIn('owner', 'owner-pass-123');
    const receipt = await pendingSubscription('99887766');
    const reference = (await db.query<{ reference: string }>(
      'SELECT reference FROM subscription_payments WHERE authority = $1',
      [receipt.authority]
    ))[0].reference;

    const statement = `1404/08/12  ${receipt.amount}  99887766  ${reference}`;
    const result = await call('POST', '/api/admin/receipt-assistant', { statement }, adminToken);
    expect(result.status).toBe(200);
    expect(result.json.assessments).toHaveLength(1);
    expect(result.json.assessments[0].authority).toBe(receipt.authority);
    expect(result.json.assessments[0].verdict).toBe('confirmed');
    expect(result.json.assessments[0].matchedLine).toBe(1);
    expect(result.json.summary).toEqual({ confirmed: 1, suspicious: 0, missing: 0, total: 1 });
    // The name of the student stays in the club; only the numbers go to the model.
    expect(result.json.assessments[0].studentName).toBeTruthy();
  });

  it('says a receipt is missing when the statement has no such transfer', async () => {
    const adminToken = await signIn('owner', 'owner-pass-123');
    await pendingSubscription('99887766');

    const result = await call('POST', '/api/admin/receipt-assistant', { statement: '1404/08/12  12345  11112222' }, adminToken);
    expect(result.status).toBe(200);
    expect(result.json.assessments).toHaveLength(1);
    expect(result.json.assessments[0].verdict).toBe('missing');
  });

  it('takes a long statement and refuses one that is out of measure', async () => {
    const adminToken = await signIn('owner', 'owner-pass-123');
    await pendingSubscription('99887766');

    // A month of a busy account: many lines, but still a normal body.
    const longStatement = Array.from({ length: 4000 }, (_, index) => `1404/08/12  ${99000 + index}  99887766`).join('\n');
    expect(longStatement.length).toBeGreaterThan(100_000);
    const ok = await call('POST', '/api/admin/receipt-assistant', { statement: longStatement }, adminToken);
    expect(ok.status).toBe(200);
    expect(ok.json.assessments).toHaveLength(1);

    // A body that is far past the measure is turned away, not read into the memory.
    const huge = 'x'.repeat(3_000_000);
    const tooBig = await call('POST', '/api/admin/receipt-assistant', { statement: huge }, adminToken);
    expect(tooBig.status).toBe(413);
  });

  it('refuses an empty statement and keeps the door shut for the students', async () => {
    const adminToken = await signIn('owner', 'owner-pass-123');
    expect((await call('POST', '/api/admin/receipt-assistant', { statement: '  ' }, adminToken)).status).toBe(400);

    const student = await studentAccount('student-not-admin');
    expect((await callAs('POST', '/api/admin/receipt-assistant', { statement: 'x' }, student)).status).toBe(403);
  });
});
