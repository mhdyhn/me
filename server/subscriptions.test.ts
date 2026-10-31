// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
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

  it('buys one month with card-to-card and confirms the receipt automatically', async () => {
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

    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(receipt.status).toBe(200);
    expect(receipt.json.success).toBe(true);
    expect(receipt.json.state.active).toBe(true);
    expect(receipt.json.state.daysLeft).toBe(30);

    const state = await call('GET', '/api/me/subscription', undefined, student);
    expect(state.json.active).toBe(true);
    expect(new Date(state.json.expiresAt).getTime()).toBeGreaterThan(clock.getTime());
  });

  it('refuses a second purchase while the subscription is running and replays a receipt', async () => {
    const student = await account('buyer-two', 'student', null, true);
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.status).toBe(201);
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(receipt.status).toBe(200);

    const again = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(again.status).toBe(409);

    const replay = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '123456789012',
    }, student);
    expect(replay.status).toBe(200);
    expect(replay.json.success).toBe(true);
  });

  it('does not accept the same receipt number for another payment', async () => {
    const student = await account('buyer-three', 'student', null, true);
    const first = await call('POST', '/api/me/subscription/checkout', undefined, student);
    await call('POST', '/api/me/subscription/receipt', { authority: first.json.authority, trackingNumber: '555000111' }, student);
    // The subscription is active now, so a second purchase is refused before the receipt check.
    const blocked = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(blocked.status).toBe(409);

    const other = await account('buyer-four', 'student', null, true);
    const second = await call('POST', '/api/me/subscription/checkout', undefined, other);
    const replay = await call('POST', '/api/me/subscription/receipt', {
      authority: second.json.authority, trackingNumber: '555000111',
    }, other);
    expect(replay.status).toBe(409);
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

    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, referred);
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '987654321',
    }, referred);
    expect(receipt.status).toBe(200);
    const rows = await db.query<{ coach_share_tomans: number; admin_share_tomans: number; source_coach_id: number }>(
      'SELECT coach_share_tomans, admin_share_tomans, source_coach_id FROM subscriptions WHERE user_id = $1',
      [referred.id]
    );
    expect(rows[0]).toMatchObject({ coach_share_tomans: 9900, admin_share_tomans: 89100, source_coach_id: coach.id });

    const independent = await account('independent-two', 'student', null, true);
    const otherCheckout = await call('POST', '/api/me/subscription/checkout', undefined, independent);
    await call('POST', '/api/me/subscription/receipt', { authority: otherCheckout.json.authority, trackingNumber: '987654322' }, independent);
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

  it('does not let a coach or an admin buy the student subscription', async () => {
    const coach = await account('coach-plain', 'coach');
    const admin = await account('admin-plain', 'admin');
    expect((await call('POST', '/api/me/subscription/checkout', undefined, coach)).status).toBe(403);
    expect((await call('POST', '/api/me/subscription/checkout', undefined, admin)).status).toBe(403);
  });
});
