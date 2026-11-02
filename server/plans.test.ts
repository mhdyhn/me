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

    // The paid plan is on sale for this student.
    const checkout = await call('POST', '/api/me/subscription/checkout', undefined, student);
    expect(checkout.status).toBe(201);
    expect(checkout.json.priceTomans).toBe(99000);
    expect(checkout.json.autoConfirm).toBe(false);
  });

  it('opens the smart parts and closes the coach parts on the paid plan', async () => {
    const student = await account('independent-paid', 'student');
    await db.query(
      `INSERT INTO subscriptions (user_id, plan, amount_tomans, status, started_at, expires_at, created_at)
       VALUES ($1, 'monthly', 99000, 'active', $2, $3, $2)`,
      [student.id, clock.toISOString(), new Date(clock.getTime() + 30 * 86400_000).toISOString()]
    );

    const plan = await call('GET', '/api/me/plan', undefined, student);
    expect(plan.json.planId).toBe('independent');
    expect(plan.json.subscriptionActive).toBe(true);
    expect(plan.json.daysLeft).toBe(30);
    expect(plan.json.features).toEqual(expect.arrayContaining([
      'smart_program', 'nutrition', 'ai_hub', 'exercise_guide', 'progress_report',
    ]));
    // Nobody wrote a programme for this student, so the coach parts stay closed.
    expect(plan.json.features).not.toContain('coach_program');
    expect(plan.json.features).not.toContain('coach_nutrition');
    expect(plan.json.features).not.toContain('coach_chat');
  });

  it('shows both plans to compare and never sells a plan to a coach', async () => {
    const coach = await account('coach-account', 'coach');
    const student = await account('student-compare', 'student');

    const plan = await call('GET', '/api/me/plan', undefined, student);
    expect(plan.json.plans.map((item: { id: string }) => item.id)).toEqual(['independent', 'coach']);
    expect(plan.json.plans[0].priceTomans).toBe(99000);
    expect(plan.json.plans[1].priceTomans).toBe(0);

    expect((await call('POST', '/api/me/subscription/checkout', undefined, coach)).status).toBe(403);

    // A coach works inside the club: every part is open and no plan is needed.
    const coachPlan = await call('GET', '/api/me/plan', undefined, coach);
    expect(coachPlan.json.features).toEqual(expect.arrayContaining(['smart_program', 'ai_hub', 'nutrition']));
  });
});
