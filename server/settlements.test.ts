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
const key = keyFromSecret('settlement-test-secret');
type Session = { id: number; token: string };
beforeEach(async () => {
  clock = new Date('2026-11-01T08:00:00.000Z');
  vi.stubEnv('NODE_ENV', 'production');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, secretKey: key, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const admin = await db.query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
  adminSessionToken = (await createSession(db, admin[0].id, 0, clock))!;
}, 30000);

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

/** A paid programme sale; the coach keeps the commission and the club keeps its part. */
async function sellProgramme(student: Session, coach: Session, amount = 100_000, share = 90_000) {
  await db.query(
    `INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, created_at, programme_id, programme_mapping, gateway_mode)
     VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7, 'offer-1', 'explicit', 'live')`,
    [student.id, coach.id, amount, share, amount - share, `manual-${student.id}-${coach.id}-${Date.now()}`, clock.toISOString()],
  );
}

describe('the settlement of the coach share', () => {
  it('shows what a coach has earned and what is still owed', async () => {
    const coach = await account('coach-one', 'coach');
    const student = await account('student-one', 'student', coach.id, true);
    await sellProgramme(student, coach, 100_000, 90_000);

    const report = await call('GET', '/api/admin/settlements', undefined, { id: 0, token: adminToken() });
    expect(report.status).toBe(200);
    expect(report.json.settlements).toHaveLength(1);
    expect(report.json.settlements[0]).toMatchObject({
      coachId: coach.id,
      coachName: 'coach-one',
      programmeShareTomans: 90_000,
      referralShareTomans: 0,
      earnedTomans: 90_000,
      paidTomans: 0,
      owedTomans: 90_000,
    });
    expect(report.json.totals).toMatchObject({ earnedTomans: 90_000, paidTomans: 0, owedTomans: 90_000 });
  });

  it('records the transfer the club made and lowers the balance', async () => {
    const coach = await account('coach-two', 'coach');
    const student = await account('student-two', 'student', coach.id, true);
    await sellProgramme(student, coach, 100_000, 90_000);

    const created = await call('POST', '/api/admin/settlements', { coachId: coach.id, amountTomans: 50_000, reference: '123456789', note: 'واریز شبا' }, { id: 0, token: adminToken() });
    expect(created.status).toBe(200);
    expect(created.json.settlement).toMatchObject({ coachId: coach.id, amountTomans: 50_000, reference: '123456789' });

    const report = await call('GET', '/api/admin/settlements', undefined, { id: 0, token: adminToken() });
    const row = report.json.settlements.find((item: any) => item.coachId === coach.id);
    expect(row).toMatchObject({ earnedTomans: 90_000, paidTomans: 50_000, owedTomans: 40_000 });
    expect(row.payments).toHaveLength(1);
    expect(report.json.totals).toMatchObject({ earnedTomans: 90_000, paidTomans: 50_000, owedTomans: 40_000 });
  });

  it('adds the referral share of the subscriptions to the balance of the coach', async () => {
    const coach = await account('coach-three', 'coach');
    const student = await account('student-three', 'student', null, true);
    await db.query(
      `INSERT INTO subscriptions (user_id, plan, amount_tomans, status, started_at, expires_at, source_coach_id, coach_share_tomans, admin_share_tomans, authority, created_at)
       VALUES ($1, 'monthly', 99_000, 'active', $2, $3, $4, 9_900, 89_100, 'sub-1', $2)`,
      [student.id, clock.toISOString(), '2026-12-01T08:00:00.000Z', coach.id],
    );

    const report = await call('GET', '/api/admin/settlements', undefined, { id: 0, token: adminToken() });
    const row = report.json.settlements.find((item: any) => item.coachId === coach.id);
    expect(row).toMatchObject({ programmeShareTomans: 0, referralShareTomans: 9_900, earnedTomans: 9_900, owedTomans: 9_900 });
  });

  it('keeps the balance of the coach away from the other coaches', async () => {
    const first = await account('coach-four', 'coach');
    const second = await account('coach-five', 'coach');
    const student = await account('student-four', 'student', first.id, true);
    await sellProgramme(student, first, 100_000, 90_000);
    await call('POST', '/api/admin/settlements', { coachId: first.id, amountTomans: 90_000 }, { id: 0, token: adminToken() });

    const mine = await call('GET', '/api/coach/settlement', undefined, first);
    expect(mine.status).toBe(200);
    expect(mine.json.settlement).toMatchObject({ coachId: first.id, earnedTomans: 90_000, paidTomans: 90_000, owedTomans: 0 });

    const other = await call('GET', '/api/coach/settlement', undefined, second);
    expect(other.status).toBe(200);
    expect(other.json.settlement).toBeNull();
  });

  it('refuses a payment without a coach or without a sensible amount', async () => {
    const student = await account('student-five', 'student', null, true);
    expect((await call('POST', '/api/admin/settlements', { coachId: student.id, amountTomans: 1000 }, { id: 0, token: adminToken() })).status).toBe(404);
    expect((await call('POST', '/api/admin/settlements', { coachId: 999999, amountTomans: 1000 }, { id: 0, token: adminToken() })).status).toBe(404);
    expect((await call('POST', '/api/admin/settlements', { coachId: 1, amountTomans: 0 }, { id: 0, token: adminToken() })).status).toBe(400);
    expect((await call('POST', '/api/admin/settlements', { coachId: 1, amountTomans: -5 }, { id: 0, token: adminToken() })).status).toBe(400);
    expect((await call('POST', '/api/admin/settlements', { coachId: 1, amountTomans: 'ten' }, { id: 0, token: adminToken() })).status).toBe(400);
  });

  it('does not let a coach or a student read or write the settlement of the club', async () => {
    const coach = await account('coach-six', 'coach');
    const student = await account('student-six', 'student', null, true);
    // Logged in but not the manager: the door is closed, and it says so.
    expect((await call('GET', '/api/admin/settlements', undefined, coach)).status).toBe(403);
    expect((await call('GET', '/api/admin/settlements', undefined, student)).status).toBe(403);
    expect((await call('POST', '/api/admin/settlements', { coachId: coach.id, amountTomans: 1000 }, coach)).status).toBe(403);
    expect((await call('POST', '/api/admin/settlements', { coachId: coach.id, amountTomans: 1000 }, student)).status).toBe(403);
    expect((await call('GET', '/api/coach/settlement', undefined, student)).status).toBe(403);
    // Not logged in at all.
    expect((await call('GET', '/api/admin/settlements')).status).toBe(401);
    expect((await call('GET', '/api/coach/settlement')).status).toBe(401);
  });

  it('shows the saved IBAN of the coach next to the balance', async () => {
    const coach = await account('coach-seven', 'coach');
    const student = await account('student-seven', 'student', coach.id, true);
    await sellProgramme(student, coach, 100_000, 90_000);
    await db.query("UPDATE users SET iban = 'IR820540102680020817909002' WHERE id = $1", [coach.id]);
    const report = await call('GET', '/api/admin/settlements', undefined, { id: 0, token: adminToken() });
    expect(report.json.settlements[0].iban).toBe('IR820540102680020817909002');
  });
});

/** The owner account that ensureAdmin created. */
let adminSessionToken = '';
function adminToken(): string {
  return adminSessionToken;
}
