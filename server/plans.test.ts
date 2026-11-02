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
const key = keyFromSecret('plans-test-secret');
type Session = { id: number; token: string };

beforeEach(async () => {
  clock = new Date('2026-10-31T08:00:00.000Z');
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', '6037999912345678');
  vi.stubEnv('CARD_TRANSFER_CARD_HOLDER', 'شرکت میتی');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  vi.stubEnv('SUBSCRIPTION_PRICE_TOMANS', '');
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

async function account(username: string, role: Role, coachId: number | null = null): Promise<Session> {
  const id = await insertUser(db, {
    username, passwordHash: 'unused-in-test', role, displayName: username,
    coachId, selfRegistered: true, mustChangePassword: false, now: clock,
  });
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

/** Gives the student an active subscription of the given paid plan. */
async function subscribe(student: Session, plan: string, amount = 99000) {
  await db.query(
    `INSERT INTO subscriptions (user_id, plan, amount_tomans, status, started_at, expires_at, created_at)
     VALUES ($1, $2, $3, 'active', $4, $5, $4)`,
    [student.id, plan, amount, clock.toISOString(), new Date(clock.getTime() + 30 * 86400_000).toISOString()]
  );
}

describe('the plans of the club', () => {
  it('gives a student with a coach the free coach plan and refuses the subscription', async () => {
    const coach = await account('coach-of-student', 'coach');
    const student = await account('student-with-coach', 'student', coach.id);

    const plan = await call('GET', '/api/me/plan', undefined, student);
    expect(plan.status).toBe(200);
    expect(plan.json.planId).toBe('coach');
    expect(plan.json.plan.priceTomans).toBe(0);
    // The coach wrote the programme and the nutrition plan, so they are open.
    expect(plan.json.features).toEqual(expect.arrayContaining([
      'coach_program', 'coach_nutrition', 'coach_chat', 'nutrition', 'ai_hub', 'exercise_guide', 'progress_report',
    ]));

    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.status).toBe(409);
    expect(String(checkout.json.error)).toContain('همراه مربی');
  });

  it('leaves an independent student on the free plan until they subscribe', async () => {
    const student = await account('independent-free', 'student');

    const plan = await call('GET', '/api/me/plan', undefined, student);
    expect(plan.json.planId).toBe('free');
    expect(plan.json.features).toEqual(expect.arrayContaining(['exercise_guide', 'progress_report']));
    expect(plan.json.features).not.toContain('smart_program');
    expect(plan.json.features).not.toContain('ai_hub');
    expect(plan.json.features).not.toContain('coach_program');
  });

  it('sells the three levels and each level opens its own parts', async () => {
    const basic = await account('student-basic', 'student');
    await subscribe(basic, 'basic', 49000);
    const basicPlan = await call('GET', '/api/me/plan', undefined, basic);
    expect(basicPlan.json.planId).toBe('basic');
    // The cheapest plan gives the programme builder, but not the nutrition or the AI.
    expect(basicPlan.json.features).toEqual(expect.arrayContaining(['smart_program', 'exercise_guide', 'progress_report']));
    expect(basicPlan.json.features).not.toContain('nutrition');
    expect(basicPlan.json.features).not.toContain('ai_hub');

    const pro = await account('student-pro', 'student');
    await subscribe(pro, 'pro', 99000);
    const proPlan = await call('GET', '/api/me/plan', undefined, pro);
    expect(proPlan.json.planId).toBe('pro');
    expect(proPlan.json.features).toEqual(expect.arrayContaining(['smart_program', 'nutrition']));
    expect(proPlan.json.features).not.toContain('ai_hub');

    const full = await account('student-full', 'student');
    await subscribe(full, 'full', 149000);
    const fullPlan = await call('GET', '/api/me/plan', undefined, full);
    expect(fullPlan.json.planId).toBe('full');
    expect(fullPlan.json.features).toEqual(expect.arrayContaining(['smart_program', 'nutrition', 'ai_hub']));
    // Nobody wrote a programme for these students, so the coach parts stay closed.
    expect(fullPlan.json.features).not.toContain('coach_program');
    expect(fullPlan.json.features).not.toContain('coach_chat');
  });

  it('keeps the older subscriptions on the plan they were bought for', async () => {
    const student = await account('student-legacy', 'student');
    await subscribe(student, 'monthly', 99000);

    const plan = await call('GET', '/api/me/plan', undefined, student);
    // The old rows bought the only plan there was, which opened everything.
    expect(plan.json.planId).toBe('full');
    expect(plan.json.features).toContain('ai_hub');
  });

  it('shows the three paid plans to compare and never sells a plan to a coach', async () => {
    const coach = await account('coach-account', 'coach');
    const student = await account('student-compare', 'student');

    const plan = await call('GET', '/api/me/plan', undefined, student);
    expect(plan.json.plans.map((item: { id: string }) => item.id)).toEqual(['basic', 'pro', 'full']);
    expect(plan.json.plans[0].priceTomans).toBe(49000);
    expect(plan.json.plans[1].priceTomans).toBe(99000);
    expect(plan.json.plans[2].priceTomans).toBe(149000);

    expect((await call('POST', '/api/me/subscription/checkout', undefined, coach)).status).toBe(403);

    // A coach works inside the club: every part is open and no plan is needed.
    const coachPlan = await call('GET', '/api/me/plan', undefined, coach);
    expect(coachPlan.json.features).toEqual(expect.arrayContaining(['smart_program', 'ai_hub', 'nutrition']));
  });

  it('sells the plan the student picked and remembers it', async () => {
    const student = await account('student-picks', 'student');

    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'basic' }, student);
    expect(checkout.status).toBe(201);
    expect(checkout.json.planId).toBe('basic');
    expect(checkout.json.priceTomans).toBe(49000);
    // The exact amount carries a small tail so the bank statement can be matched.
    expect(checkout.json.transferAmountTomans).toBeGreaterThan(49000);

    const payment = await db.query<{ plan: string }>(
      'SELECT plan FROM subscription_payments WHERE authority = $1',
      [checkout.json.authority]
    );
    expect(payment[0].plan).toBe('basic');
  });

  it('refuses a plan that is not for sale', async () => {
    const student = await account('student-bad-plan', 'student');
    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'coach' }, student);
    expect(checkout.status).toBe(400);
    expect(String(checkout.json.error)).toContain('قابل خرید');
  });
});

describe('the prices of the plans in the manager panel', () => {
  it('changes the price of a plan and the paywall shows the new price', async () => {
    const admin = await account('manager', 'admin');
    const student = await account('student-new-price', 'student');

    const before = await call('GET', '/api/me/plan', undefined, student);
    expect(before.json.plans.find((item: { id: string }) => item.id === 'pro').priceTomans).toBe(99000);

    const saved = await call('PUT', '/api/admin/plans', { pro: 129000 }, admin);
    expect(saved.status).toBe(200);
    expect(saved.json.plans.find((item: { id: string }) => item.id === 'pro').priceTomans).toBe(129000);

    const after = await call('GET', '/api/me/plan', undefined, student);
    expect(after.json.plans.find((item: { id: string }) => item.id === 'pro').priceTomans).toBe(129000);

    // The new price is the one the student pays.
    const checkout = await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, student);
    expect(checkout.status).toBe(201);
    expect(checkout.json.priceTomans).toBe(129000);
  });

  it('refuses a price that is not a sane amount', async () => {
    const admin = await account('manager-bad-price', 'admin');
    const saved = await call('PUT', '/api/admin/plans', { pro: 10 }, admin);
    expect(saved.status).toBe(400);
    expect(String(saved.json.error)).toContain('تومان');
  });

  it('keeps the three levels apart even when the environment carries one price', async () => {
    // The club has one price in the environment; that must not flatten the three levels.
    vi.stubEnv('SUBSCRIPTION_PRICE_TOMANS', '99000');
    const admin = await account('manager-env-price', 'admin');
    const student = await account('student-env-price', 'student');

    const plan = await call('GET', '/api/me/plan', undefined, student);
    const prices = plan.json.plans.map((item: { id: string; priceTomans: number }) => [item.id, item.priceTomans]);
    expect(prices).toEqual([['basic', 49000], ['pro', 99000], ['full', 149000]]);

    // The admin writes a new price and it replaces the price of the database.
    const saved = await call('PUT', '/api/admin/plans', { full: 199000 }, admin);
    expect(saved.status).toBe(200);
    const after = await call('GET', '/api/me/plan', undefined, student);
    expect(after.json.plans.find((item: { id: string }) => item.id === 'full').priceTomans).toBe(199000);
    // The other two keep their own price.
    expect(after.json.plans.find((item: { id: string }) => item.id === 'basic').priceTomans).toBe(49000);
  });

  it('does not let a student change the prices', async () => {
    const student = await account('student-cheap-price', 'student');
    const saved = await call('PUT', '/api/admin/plans', { pro: 1000 }, student);
    expect(saved.status).toBe(403);
  });
});
