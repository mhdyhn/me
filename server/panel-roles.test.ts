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
 * The panels of the three roles.
 *
 * The manager and the coach have a panel that folds its sections away. The folding is a
 * matter of the screen, not of the rights: a student must not reach the manager's
 * sections, and the sections that are open must not change what the server allows.
 */
let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-11-02T09:00:00Z');

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('panel-roles-secret') }));
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

async function account(username: string, role: 'admin' | 'coach' | 'student'): Promise<{ id: number; token: string }> {
  const id = await insertUser(db, {
    username, passwordHash: 'unused-in-test', role, displayName: username,
    coachId: null, selfRegistered: false, mustChangePassword: false, now: clock,
  });
  return { id, token: (await createSession(db, id, 0, clock))! };
}

describe('the panels of the three roles', () => {
  it('lets the manager reach every section of their own panel', async () => {
    const admin = await account('panel-admin', 'admin');
    // The three sections the manager folds away all answer for a manager.
    expect((await call('GET', '/api/admin/students', undefined, admin.token)).status).toBe(200);
    expect((await call('GET', '/api/admin/card-transfer', undefined, admin.token)).status).toBe(200);
    expect((await call('GET', '/api/admin/card-transfer/receipts', undefined, admin.token)).status).toBe(200);
    expect((await call('GET', '/api/admin/plans', undefined, admin.token)).status).toBe(200);
    expect((await call('GET', '/api/admin/ai', undefined, admin.token)).status).toBe(200);
  });

  it('keeps the manager-only sections shut for a coach and a student', async () => {
    const coach = await account('panel-coach', 'coach');
    const student = await account('panel-student', 'student');
    for (const token of [coach.token, student.token]) {
      expect((await call('GET', '/api/admin/students', undefined, token)).status).toBe(403);
      expect((await call('GET', '/api/admin/card-transfer', undefined, token)).status).toBe(403);
      expect((await call('GET', '/api/admin/card-transfer/receipts', undefined, token)).status).toBe(403);
      expect((await call('GET', '/api/admin/plans', undefined, token)).status).toBe(403);
      expect((await call('POST', '/api/admin/receipt-assistant', { statement: '1404/08/12 1000 1' }, token)).status).toBe(403);
      expect((await call('POST', '/api/admin/card-transfer/review', { authority: 'CARD-1', action: 'confirm' }, token)).status).toBe(403);
      // The price of the plans is a matter of the club, not of the students.
      expect((await call('PUT', '/api/admin/plans', { basic: 1, pro: 1, full: 1 }, token)).status).toBe(403);
    }
  });

  it('keeps the report of the coach to the coach alone', async () => {
    const admin = await account('panel-admin-2', 'admin');
    const coach = await account('panel-coach-2', 'coach');
    const student = await account('panel-student-2', 'student');
    expect((await call('GET', '/api/coach/inactive-students', undefined, coach.token)).status).toBe(200);
    // The report is about the students of one coach; nobody else reads it.
    expect((await call('GET', '/api/coach/inactive-students', undefined, admin.token)).status).toBe(403);
    expect((await call('GET', '/api/coach/inactive-students', undefined, student.token)).status).toBe(403);
  });

  it('gives the coach the plan of the club and never sells him one', async () => {
    const coach = await account('panel-coach-3', 'coach');
    const plan = await call('GET', '/api/me/plan', undefined, coach.token);
    expect(plan.status).toBe(200);
    expect(plan.json.planId).toBe('coach');
    // The coach works inside the club; he buys no plan.
    expect((await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, coach.token)).status).toBe(403);
  });

  it('gives the manager the plan of the club and never sells him one', async () => {
    const admin = await account('panel-admin-3', 'admin');
    const plan = await call('GET', '/api/me/plan', undefined, admin.token);
    expect(plan.status).toBe(200);
    expect(plan.json.planId).toBe('coach');
    expect((await call('POST', '/api/me/subscription/checkout', { planId: 'pro' }, admin.token)).status).toBe(403);
  });

  it('shows the student his own plan and the price of the plans on sale', async () => {
    const student = await account('panel-student-3', 'student');
    const plan = await call('GET', '/api/me/plan', undefined, student.token);
    expect(plan.status).toBe(200);
    expect(plan.json.planId).toBe('free');
    // The three paid plans are on sale with their price of the day.
    const paid = (plan.json.plans as any[]).filter((item) => item.priceTomans > 0);
    expect(paid.map((item) => item.id)).toEqual(['basic', 'pro', 'full']);
    // The free plan of the student opens the report and the guide, and nothing paid.
    expect(plan.json.features).toEqual(expect.arrayContaining(['progress_report', 'exercise_guide']));
    expect(plan.json.features).not.toContain('smart_program');
  });
});
