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
const clock = new Date('2026-10-30T08:00:00Z');
const CARD = '6037999912345678';

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PAYMENT_PUBLIC_BASE_URL', '');
  vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
  vi.stubEnv('ZARINPAL_SANDBOX', 'true');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', CARD);
  vi.stubEnv('CARD_TRANSFER_CARD_HOLDER', 'شرکت میتی');
  vi.stubEnv('CARD_TRANSFER_EXPIRY_HOURS', '72');
  vi.stubEnv('CARD_TRANSFER_MAX_PER_DAY', '3');
  vi.stubEnv('CARD_TRANSFER_UNIQUE_AMOUNT', 'on');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('card-transfer-suite-secret') }));
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
  const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function createStudent(coachToken: string) {
  const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد' }, coachToken);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function saveProgram(coachToken: string, studentId: number, priceTomans = 99999, current?: { id: string; version: number }) {
  const saved = await call('PUT', `/api/students/${studentId}/program`, {
    title: 'برنامهٔ آزمایش', priceTomans,
    days: [{ name: 'روز اول', exercises: [{ exerciseId: 'bench-press', name: 'پرس سینه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    ...(current ? { saveMode: 'new', expectedId: current.id, expectedVersion: current.version } : {}),
  }, coachToken);
  expect(saved.status).toBe(200);
  return saved.json.program as { id: string; version: number };
}

function request(program: { id: string; version: number }) {
  return { expectedId: program.id, expectedVersion: program.version };
}

describe('card-to-card payment', () => {
  it('is closed while no destination card is configured', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', '');
    const started = await call('POST', '/api/pay/card-transfer/start', request(program), student.token);
    expect(started.status).toBe(503);
    expect((await call('GET', '/api/pay/card-transfer/availability', undefined, student.token)).json.available).toBe(false);
    expect(await db.query('SELECT * FROM payment_transactions')).toEqual([]);
  });

  it('shows the exact amount, the card and a reference, and keeps the programme locked until a receipt arrives', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);

    const started = await call('POST', '/api/pay/card-transfer/start', request(program), student.token);
    expect(started.status).toBe(201);
    const details = started.json;
    expect(details.cardNumber).toBe(CARD);
    expect(details.cardHolder).toBe('شرکت میتی');
    expect(details.priceTomans).toBe(99999);
    // The unique amount is the price plus a small tail so the transfer can be found in the statement.
    expect(details.transferAmountTomans).toBeGreaterThan(99999);
    expect(details.transferAmountTomans).toBeLessThan(99999 + 1000);
    expect(details.reference).toMatch(/^MT-[A-Z2-9]{6}$/);
    expect(details.authority).toMatch(/^CARD-/);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(false);

    // The same programme keeps one pending payment.
    const again = await call('POST', '/api/pay/card-transfer/start', request(program), student.token);
    expect(again.status).toBe(201);
    expect(again.json.authority).toBe(details.authority);
    expect(await db.query('SELECT * FROM payment_transactions')).toHaveLength(1);
  });

  it('confirms a matching receipt automatically, unlocks the programme and records the coach share', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const details = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;

    const wrongAmount = await call('POST', '/api/pay/card-transfer/receipt', {
      authority: details.authority, trackingNumber: '99887766', amountTomans: 99999,
    }, student.token);
    expect(wrongAmount.status).toBe(400);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(false);

    const confirmed = await call('POST', '/api/pay/card-transfer/receipt', {
      authority: details.authority, trackingNumber: '99887766', amountTomans: details.transferAmountTomans, senderCardLast4: '4321',
    }, student.token);
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.success).toBe(true);
    expect(confirmed.json.transaction).toMatchObject({
      status: 'paid', method: 'card_transfer', amountTomans: 99999, coachShareTomans: 89999, adminShareTomans: 10000,
      refId: '99887766', cardTransferConfirmedBy: 'auto',
    });
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(true);

    // The coach and the admin see the same real transaction in the financial report.
    const coachReport = await call('GET', '/api/coach/transactions', undefined, coach.token);
    expect(coachReport.json.transactions).toHaveLength(1);
    expect(coachReport.json.transactions[0]).toMatchObject({ method: 'card_transfer', status: 'paid', amountTomans: 99999 });
    const adminReport = await call('GET', '/api/admin/transactions', undefined, admin);
    expect(adminReport.json.transactions).toHaveLength(1);
  });

  it('refuses a reused receipt number, another student and a missing receipt number', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const other = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const otherProgram = await saveProgram(coach.token, other.id);
    const details = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;
    const otherDetails = (await call('POST', '/api/pay/card-transfer/start', request(otherProgram), other.token)).json;

    expect((await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority, trackingNumber: '123' }, student.token)).status).toBe(400);
    expect((await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority }, student.token)).status).toBe(400);
    // Another student cannot confirm a receipt for someone else's request.
    expect((await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority, trackingNumber: '55667788' }, other.token)).status).toBe(404);

    expect((await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority, trackingNumber: '55667788' }, student.token)).status).toBe(200);
    // The same receipt number cannot be used for a second programme.
    const reused = await call('POST', '/api/pay/card-transfer/receipt', { authority: otherDetails.authority, trackingNumber: '55667788' }, other.token);
    expect(reused.status).toBe(409);
    expect((await call('GET', '/api/me/program', undefined, other.token)).json.isPaid).toBe(false);
  });

  it('keeps the receipt window and the daily limit', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const details = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;

    await db.query("UPDATE payment_transactions SET created_at = '2026-10-20T08:00:00Z' WHERE authority = $1", [details.authority]);
    const expired = await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority, trackingNumber: '11223344' }, student.token);
    expect(expired.status).toBe(409);
    expect((await db.query('SELECT status FROM payment_transactions WHERE authority = $1', [details.authority]))[0].status).toBe('expired');

    // A new request after the expiry, then the daily limit of three confirmed transfers.
    vi.stubEnv('CARD_TRANSFER_MAX_PER_DAY', '1');
    const fresh = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;
    expect((await call('POST', '/api/pay/card-transfer/receipt', { authority: fresh.authority, trackingNumber: '22334455' }, student.token)).status).toBe(200);
    const second = await saveProgram(coach.token, student.id, 50000, program);
    const secondDetails = (await call('POST', '/api/pay/card-transfer/start', request(second), student.token)).json;
    const limited = await call('POST', '/api/pay/card-transfer/receipt', { authority: secondDetails.authority, trackingNumber: '33445566' }, student.token);
    expect(limited.status).toBe(429);
  });

  it('lets an administrator confirm a receipt the automatic check could not settle', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const details = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;

    expect((await call('POST', '/api/admin/card-transfer/review', { authority: details.authority, action: 'confirm' }, student.token)).status).toBe(403);
    const reviewed = await call('POST', '/api/admin/card-transfer/review', { authority: details.authority, action: 'confirm' }, admin);
    expect(reviewed.status).toBe(200);
    expect(reviewed.json.transaction).toMatchObject({ status: 'paid', cardTransferConfirmedBy: 'manual' });
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(true);
  });

  it('never confirms a receipt when the verification service refuses it', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const details = (await call('POST', '/api/pay/card-transfer/start', request(program), student.token)).json;

    vi.stubEnv('CARD_TRANSFER_VERIFY_URL', 'https://verify.example.com/receipt');
    const nativeFetch = globalThis.fetch;
    const guardedFetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).startsWith('https://verify.example.com/')) {
        return new Response(JSON.stringify({ valid: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!String(input).startsWith(base + '/')) throw new Error('Unexpected external request');
      return nativeFetch(input, init);
    });

    const refused = await call('POST', '/api/pay/card-transfer/receipt', { authority: details.authority, trackingNumber: '77889900' }, student.token);
    expect(refused.status).toBe(409);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(false);
    guardedFetch.mockRestore();
    globalThis.fetch = nativeFetch;
  });
});
