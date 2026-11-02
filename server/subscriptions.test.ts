// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { createSession } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { insertUser, type Role } from './users.ts';

let db: Db;
let server: Server;
let base: string;
let clock: Date;
const key = keyFromSecret('subscription-test-secret');
type Session = { id: number; token: string };
const CARD = '6037999912345678';

beforeEach(async () => {
  clock = new Date('2026-10-31T08:00:00.000Z');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', CARD);
  vi.stubEnv('CARD_TRANSFER_CARD_HOLDER', 'شرکت میتی');
  vi.stubEnv('CARD_TRANSFER_EXPIRY_HOURS', '72');
  vi.stubEnv('CARD_TRANSFER_MAX_PER_DAY', '3');
  vi.stubEnv('CARD_TRANSFER_UNIQUE_AMOUNT', 'on');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  vi.stubEnv('SUBSCRIPTION_PRICE_TOMANS', '99000');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, secretKey: key, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
});

async function account(username: string, role: Role, coachId: number | null = null, selfRegistered = false): Promise<Session> {
  const id = await insertUser(db, { username, passwordHash: 'unused-in-test', role, displayName: username, coachId, selfRegistered, mustChangePassword: false, now: clock });
  const token = (await createSession(db, id, 0, clock))!;
  return { id, token };
}

async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

async function call(method: string, path: string, body?: unknown, session?: Session) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any> };
}

describe('the optional student subscription', () => {
  it('keeps the base product free and shows the price', async () => {
    const student = await account('independent', 'student', null, true);
    const state = await call('GET', '/api/me/subscription', undefined, student);
    expect(state.status).toBe(200);
    expect(state.json).toMatchObject({ active: false, priceTomans: 99000, daysLeft: 0 });
    expect(state.json.expiresAt).toBeNull();
  });

  it('keeps the month closed until a manager matches the receipt', async () => {
    const student = await account('buyer', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.status).toBe(201);
    expect(checkout.json.cardNumber).toBe(CARD);
    expect(checkout.json.priceTomans).toBe(99000);
    expect(checkout.json.transferAmountTomans).toBeGreaterThan(99000);
    expect(checkout.json.reference).toMatch(/^MT-[A-Z2-9]{6}$/);

    const wrong = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012', amountTomans: 99000,
    }, student);
    expect(wrong.status).toBe(400);

    // A reference nobody sent is only written down; the month stays closed.
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    // The receipt is accepted and waits in the queue; that is good news, not a conflict.
    expect(receipt.status).toBe(200);
    expect(receipt.json.success).toBe(true);
    expect(receipt.json.pending).toBe(true);
    expect(String(receipt.json.message ?? '')).toContain('صف');
    expect((await call('GET', '/api/me/subscription', undefined, student)).json.active).toBe(false);

    // The manager matches the transfer in the statement and settles it.
    const admin = await signIn('owner', 'owner-pass-123');
    const reviewed = await call('POST', '/api/admin/card-transfer/review', {
      authority: checkout.json.authority, action: 'confirm',
    }, { id: 0, token: admin });
    expect(reviewed.status).toBe(200);

    const state = await call('GET', '/api/me/subscription', undefined, student);
    expect(state.json.active).toBe(true);
    expect(state.json.daysLeft).toBe(30);
    expect(new Date(state.json.expiresAt).getTime()).toBeGreaterThan(clock.getTime());
  });

  it('cancels the payment and tells the student when the manager rejects the receipt', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const student = await account('buyer-rejected', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '44556677',
    }, student);

    const rejected = await call('POST', '/api/admin/card-transfer/review', {
      authority: checkout.json.authority, action: 'reject',
    }, { id: 0, token: admin });
    expect(rejected.status).toBe(200);
    expect(rejected.json.success).toBe(false);
    expect((await call('GET', '/api/me/subscription', undefined, student)).json.active).toBe(false);
    const rows = await db.query<{ status: string }>(
      'SELECT status FROM subscription_payments WHERE authority = $1', [checkout.json.authority]
    );
    expect(rows[0].status).toBe('canceled');
    // The student hears about it in the app.
    const notifications = await call('GET', '/api/notifications', undefined, student);
    expect(notifications.json.notifications.some((item: { title: string }) => item.title.includes('تأیید نشد'))).toBe(true);
  });

  it('activates the month at once when the bank service verifies the receipt', async () => {
    vi.stubEnv('CARD_TRANSFER_VERIFY_URL', 'https://verify.example.com/subscription');
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).startsWith('https://verify.example.com/')) {
        return new Response(JSON.stringify({ valid: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!String(input).startsWith(base + '/')) throw new Error('Unexpected external request');
      return nativeFetch(input, init);
    });

    const student = await account('buyer-auto', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.json.autoConfirm).toBe(true);

    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(receipt.status).toBe(200);
    expect(receipt.json.success).toBe(true);
    expect(receipt.json.state.active).toBe(true);
    expect(receipt.json.state.daysLeft).toBe(30);
    vi.restoreAllMocks();
  });

  it('refuses a second purchase while the subscription is running and replays a receipt', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const student = await account('buyer-two', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.status).toBe(201);
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(receipt.status).toBe(200);
    expect(receipt.json.pending).toBe(true);
    await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'confirm' }, { id: 0, token: admin });

    const again = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(again.status).toBe(409);

    const replay = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(replay.status).toBe(200);
    expect(replay.json.success).toBe(true);
  });

  it('does not accept the same receipt number for another payment', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const student = await account('buyer-three', 'student', null, true);
    const first = await call('POST', '/api/me/subscription/checkout', undefined, student);
    await call('POST', '/api/me/subscription/receipt', { authority: first.json.authority, trackingNumber: '555000111' }, student);
    await call('POST', '/api/admin/card-transfer/review', { authority: first.json.authority, action: 'confirm' }, { id: 0, token: admin });
    // The subscription is active now, so a second purchase is refused before the receipt check.
    const blocked = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(blocked.status).toBe(409);

    const other = await account('buyer-four', 'student', null, true);
    const second = await call('POST', '/api/me/subscription/checkout', undefined, other);
    const replay = await call('POST', '/api/me/subscription/receipt', {
      authority: second.json.authority, trackingNumber: '555000111',
    }, other);
    expect(replay.status).toBe(409);
    expect(String(replay.json.error ?? '')).toContain('قبلاً ثبت شده');
  });

  it('gives the referring coach a share only for a student who came through their link', async () => {
    const coach = await account('coach-ref', 'coach');
    const referred = await account('referred-student', 'student', null, true);
    const link = await call('POST', '/api/coach/registration-link', { accountId: coach.id }, coach);
    expect(link.status).toBe(200);
    const accept = await call('POST', '/api/me/coach-registration-link/accept', {
      token: link.json.token, accountId: referred.id, consent: true,
    }, referred);
    expect(accept.status).toBe(200);

    const admin = await signIn('owner', 'owner-pass-123');
    // While the coach's programme is open the student is on the free coach plan. Once the
    // student returns to their own programme the smart plan is theirs, and the coach who
    // referred them keeps the referral share of the subscription.
    expect((await call('GET', '/api/me/plan', undefined, referred)).json.planId).toBe('coach');
    await call('POST', '/api/me/coach-access/withdraw', { accountId: referred.id }, referred);
    await call('POST', '/api/me/personal-program/activate', { accountId: referred.id }, referred);
    expect((await call('GET', '/api/me/plan', undefined, referred)).json.planId).toBe('free');
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, referred);
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '987654321',
    }, referred);
    expect(receipt.status).toBe(200);
    expect(receipt.json.pending).toBe(true);
    await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'confirm' }, { id: 0, token: admin });
    const rows = await db.query<{ coach_share_tomans: number; admin_share_tomans: number; source_coach_id: number }>(
      'SELECT coach_share_tomans, admin_share_tomans, source_coach_id FROM subscriptions WHERE user_id = $1',
      [referred.id]
    );
    expect(rows[0]).toMatchObject({ coach_share_tomans: 9900, admin_share_tomans: 89100, source_coach_id: coach.id });

    const independent = await account('independent-two', 'student', null, true);
    const otherCheckout = await call('POST', '/api/me/subscription/checkout', undefined, independent);
    await call('POST', '/api/me/subscription/receipt', { authority: otherCheckout.json.authority, trackingNumber: '987654322' }, independent);
    await call('POST', '/api/admin/card-transfer/review', { authority: otherCheckout.json.authority, action: 'confirm' }, { id: 0, token: admin });
    const otherRows = await db.query<{ coach_share_tomans: number; source_coach_id: number | null }>(
      'SELECT coach_share_tomans, source_coach_id FROM subscriptions WHERE user_id = $1',
      [independent.id]
    );
    expect(otherRows[0]).toMatchObject({ coach_share_tomans: 0, source_coach_id: null });

    // The coach sees the referral share in their own financial report.
    const report = await call('GET', '/api/coach/transactions', undefined, coach);
    expect(report.status).toBe(200);
    expect(report.json.subscriptionShares).toHaveLength(1);
    expect(report.json.subscriptionShares[0]).toMatchObject({ studentName: 'referred-student', coachShareTomans: 9900, amountTomans: 99000 });
  });

  it('opens one month when the same receipt arrives twice at the same moment', async () => {
    vi.stubEnv('CARD_TRANSFER_VERIFY_URL', 'https://verify.example.com/receipt');
    const student = await account('double-receipt', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);

    // The first request waits inside the verification service until the second one has read
    // the pending payment, so both of them see the same state.
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let verifications = 0;
    const nativeFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (String(input).startsWith('https://verify.example.com/')) {
        verifications += 1;
        if (verifications === 1) await gate;
        return new Response(JSON.stringify({ valid: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (!String(input).startsWith(base + '/')) throw new Error('Unexpected external request');
      return nativeFetch(input, init);
    });

    const first = call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '55667788',
    }, student);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '55667788',
    }, student);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(verifications).toBe(2);
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult.status).toBe(200);
    expect(secondResult.status).toBe(200);

    // One transfer buys one month: the subscription is not written twice and the coach is
    // not paid twice.
    const rows = await db.query<{ coach_share_tomans: number }>(
      'SELECT coach_share_tomans FROM subscriptions WHERE user_id = $1', [student.id]
    );
    expect(rows.length).toBe(1);
    const payments = await db.query<{ status: string }>(
      "SELECT status FROM subscription_payments WHERE user_id = $1 AND status = 'paid'", [student.id]
    );
    expect(payments.length).toBe(1);
    vi.restoreAllMocks();
  });

  it('does not let a coach or an admin buy the student subscription', async () => {
    const coach = await account('coach-plain', 'coach');
    const admin = await account('admin-plain', 'admin');
    expect((await call('POST', '/api/me/subscription/checkout', undefined, coach)).status).toBe(403);
    expect((await call('POST', '/api/me/subscription/checkout', undefined, admin)).status).toBe(403);
  });
});
