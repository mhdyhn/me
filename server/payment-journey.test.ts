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

/**
 * The whole payment journey, from the first click to the open programme.
 *
 * The club never opens a paid part on a promise, so the whole chain has to hold: the
 * student asks for a plan, gets an exact amount to transfer, sends the tracking number,
 * the manager sees the transfer in the statement, the assistant says what it thinks, the
 * manager confirms, and only then the plan opens. This suite walks that chain with the
 * real server and the real database rules, and it checks the money on the way.
 */
let db: Db;
let server: Server;
let base: string;
/**
 * The clock of the suite. It moves forward on purpose: the receipt of a card transfer
 * is only valid for a limited time, so the journey has to happen within it.
 */
let clock = new Date('2026-11-02T09:00:00Z');
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
  vi.stubEnv('SUBSCRIPTION_PRICE_TOMANS', '');
  vi.stubEnv('SUBSCRIPTION_REFERRAL_PERCENT', '10');
  clock = new Date('2026-11-02T09:00:00Z');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('payment-journey-secret') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
});

async function call(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as any };
}

/**
 * A student without a coach's programme, so the paid plans are on sale for him.
 *
 * The `source` is the coach whose registration link he came through; that coach earns
 * a share of the plan, but the student is still an independent one.
 */
async function independentStudent(username: string, sourceCoachId: number | null = null): Promise<{ id: number; token: string }> {
  const id = await insertUser(db, {
    username, passwordHash: 'unused-in-test', role: 'student', displayName: username,
    coachId: null, selfRegistered: true, mustChangePassword: false, now: clock,
  });
  await db.query('UPDATE users SET personal_program_mode = 1, referred_by_coach_id = $1 WHERE id = $2', [sourceCoachId, id]);
  const token = (await createSession(db, id, 0, clock))!;
  return { id, token };
}

describe('the payment journey of a subscription', () => {
  it('opens the plan only after the manager confirms the transfer', async () => {
    const admin = (await call('POST', '/api/auth/login', { username: 'owner', password: 'owner-pass-123' })).json.token as string;
    const student = await independentStudent('journey-student');

    // 1. The student picks the middle plan and asks for the payment details.
    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, student.token);
    expect(checkout.status).toBe(201);
    expect(checkout.json.planId).toBe('pro');
    expect(checkout.json.priceTomans).toBe(99000);
    expect(checkout.json.cardNumber).toBe(CARD);
    // The amount carries a small tail, so the transfer can be found in the statement.
    expect(checkout.json.transferAmountTomans).toBeGreaterThan(99000);
    expect(checkout.json.transferAmountTomans).toBeLessThan(99000 + 1000);
    const authority = checkout.json.authority as string;
    const transferAmount = checkout.json.transferAmountTomans as number;

    // 2. Nothing is open before the money arrives.
    const before = await call('GET', '/api/me/plan', undefined, student.token);
    expect(before.json.planId).toBe('free');
    expect(before.json.features).not.toContain('smart_program');

    // 3. The student sends the tracking number of the transfer.
    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority, trackingNumber: '99887766', senderCardLast4: '1234',
    }, student.token);
    // The receipt is good news: the server answers with 200 and says it is waiting.
    expect(receipt.status).toBe(200);
    expect(receipt.json.success).toBe(true);
    expect(receipt.json.pending).toBe(true);
    // A receipt that no one checked opens nothing.
    expect(receipt.json.state.active).toBe(false);

    const stillFree = await call('GET', '/api/me/plan', undefined, student.token);
    expect(stillFree.json.planId).toBe('free');
    expect(stillFree.json.features).not.toContain('smart_program');

    // 4. The manager pastes the statement of the club's account.
    const statement = `1404/08/12  ${transferAmount}  99887766  ${checkout.json.reference}`;
    const analysis = await call('POST', '/api/admin/receipt-assistant', { statement }, admin);
    expect(analysis.status).toBe(200);
    expect(analysis.json.assessments).toHaveLength(1);
    expect(analysis.json.assessments[0].authority).toBe(authority);
    expect(analysis.json.assessments[0].verdict).toBe('confirmed');
    expect(analysis.json.summary.confirmed).toBe(1);

    // 5. The manager confirms; the plan opens for the student.
    const review = await call('POST', '/api/admin/card-transfer/review', { authority, action: 'confirm' }, admin);
    expect(review.status).toBe(200);

    const after = await call('GET', '/api/me/plan', undefined, student.token);
    expect(after.json.planId).toBe('pro');
    expect(after.json.subscriptionActive).toBe(true);
    expect(after.json.daysLeft).toBe(30);
    expect(after.json.features).toEqual(expect.arrayContaining(['smart_program', 'nutrition']));
    // The plan the student bought is the one that is open, not the most expensive one.
    expect(after.json.features).not.toContain('ai_hub');

    // 6. The money is on the books: the whole amount went to the club, no coach share.
    const subscription = (await db.query<{
      plan: string; amount_tomans: number; coach_share_tomans: number; admin_share_tomans: number; status: string;
    }>('SELECT plan, amount_tomans, coach_share_tomans, admin_share_tomans, status FROM subscriptions WHERE user_id = $1', [student.id]))[0];
    expect(subscription.plan).toBe('pro');
    expect(subscription.amount_tomans).toBe(99000);
    expect(subscription.coach_share_tomans).toBe(0);
    expect(subscription.admin_share_tomans).toBe(99000);
    expect(subscription.status).toBe('active');

    // 7. The student hears about it in the app.
    const notifications = await call('GET', '/api/notifications', undefined, student.token);
    expect(notifications.json.notifications.some((item: any) => String(item.title).includes('تأیید'))).toBe(true);
  });

  it('gives the coach who referred the student ten percent of the plan', async () => {
    const admin = (await call('POST', '/api/auth/login', { username: 'owner', password: 'owner-pass-123' })).json.token as string;
    const coachId = await insertUser(db, {
      username: 'journey-coach', passwordHash: 'unused-in-test', role: 'coach', displayName: 'مربی',
      coachId: null, selfRegistered: false, mustChangePassword: false, now: clock,
    });
    const student = await independentStudent('journey-referred', coachId);

    // The student came through the registration link of the coach, so the coach is his
    // source and his share is written on the payment.
    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'full' }, student.token);
    expect(checkout.status).toBe(201);
    expect(checkout.json.priceTomans).toBe(149000);

    const receipt = await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '55667788',
    }, student.token);
    expect(receipt.status).toBe(200);

    await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'confirm' }, admin);

    const subscription = (await db.query<{
      plan: string; amount_tomans: number; coach_share_tomans: number; admin_share_tomans: number; source_coach_id: number | null;
    }>('SELECT plan, amount_tomans, coach_share_tomans, admin_share_tomans, source_coach_id FROM subscriptions WHERE user_id = $1', [student.id]))[0];
    expect(subscription.plan).toBe('full');
    expect(subscription.amount_tomans).toBe(149000);
    expect(subscription.source_coach_id).toBe(coachId);
    // Ten percent to the coach, the rest to the club.
    expect(subscription.coach_share_tomans).toBe(14900);
    expect(subscription.admin_share_tomans).toBe(134100);
    // The share adds up; nothing is lost on the way.
    expect(subscription.coach_share_tomans + subscription.admin_share_tomans).toBe(subscription.amount_tomans);

    // The coach sees his share in his own report.
    const coachToken = (await createSession(db, coachId, 0, clock))!;
    const shares = await call('GET', '/api/coach/transactions', undefined, coachToken);
    expect(shares.status).toBe(200);
    expect(shares.json.subscriptionShares.some((item: any) => item.amountTomans === 149000)).toBe(true);
  });

  it('closes the plan and tells the student when the manager rejects the receipt', async () => {
    const admin = (await call('POST', '/api/auth/login', { username: 'owner', password: 'owner-pass-123' })).json.token as string;
    const student = await independentStudent('journey-rejected');

    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'basic' }, student.token);
    await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '11223344',
    }, student.token);

    const review = await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'reject' }, admin);
    expect(review.status).toBe(200);

    // Nothing is open and no money is taken.
    const plan = await call('GET', '/api/me/plan', undefined, student.token);
    expect(plan.json.planId).toBe('free');
    expect(plan.json.features).not.toContain('smart_program');
    const subscriptions = await db.query('SELECT id FROM subscriptions WHERE user_id = $1', [student.id]);
    expect(subscriptions).toHaveLength(0);

    // The student hears that the receipt was not accepted.
    const notifications = await call('GET', '/api/notifications', undefined, student.token);
    expect(notifications.json.notifications.some((item: any) => String(item.title).includes('تأیید نشد'))).toBe(true);
  });

  it('never opens the plan for a receipt that no transfer backs', async () => {
    const admin = (await call('POST', '/api/auth/login', { username: 'owner', password: 'owner-pass-123' })).json.token as string;
    const student = await independentStudent('journey-fake');

    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, student.token);
    await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '00000000',
    }, student.token);

    // The statement of the club's account has no such transfer.
    const analysis = await call('POST', '/api/admin/receipt-assistant', { statement: '1404/08/12  12345  11112222' }, admin);
    expect(analysis.json.assessments[0].verdict).toBe('missing');

    const plan = await call('GET', '/api/me/plan', undefined, student.token);
    expect(plan.json.planId).toBe('free');
    expect(plan.json.features).not.toContain('smart_program');
  });

  it('does not take the money twice for one receipt', async () => {
    const admin = (await call('POST', '/api/auth/login', { username: 'owner', password: 'owner-pass-123' })).json.token as string;
    const student = await independentStudent('journey-twice');

    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'basic' }, student.token);
    await call('POST', '/api/me/subscription/receipt', {
      authority: checkout.json.authority, trackingNumber: '44556677',
    }, student.token);

    await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'confirm' }, admin);
    // The manager presses the button a second time.
    await call('POST', '/api/admin/card-transfer/review', { authority: checkout.json.authority, action: 'confirm' }, admin);

    const subscriptions = await db.query('SELECT id FROM subscriptions WHERE user_id = $1', [student.id]);
    expect(subscriptions).toHaveLength(1);
  });

  it('gives a student with a coach the coach plan and refuses to sell him one', async () => {
    const coachId = await insertUser(db, {
      username: 'journey-coach-2', passwordHash: 'unused-in-test', role: 'coach', displayName: 'مربی',
      coachId: null, selfRegistered: false, mustChangePassword: false, now: clock,
    });
    const studentId = await insertUser(db, {
      username: 'journey-with-coach', passwordHash: 'unused-in-test', role: 'student', displayName: 'شاگرد',
      coachId, selfRegistered: false, mustChangePassword: false, now: clock,
    });
    const student = { id: studentId, token: (await createSession(db, studentId, 0, clock))! };

    const plan = await call('GET', '/api/me/plan', undefined, student.token);
    expect(plan.json.planId).toBe('coach');
    expect(plan.json.features).toContain('coach_program');

    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, student.token);
    expect(checkout.status).toBe(409);
    expect(String(checkout.json.error)).toContain('همراه مربی');
  });
});
