// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

/** A fresh mobile number for every account: one number belongs to one account only. */
let phoneSequence = 0;
function nextPhone(): string {
  phoneSequence += 1;
  return `0912${String(3450000 + phoneSequence)}`;
}

type Json = Record<string, any>;
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
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('notifications-suite-secret') }));
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
  const created = await call('POST', '/api/coaches', { phoneNumber: nextPhone(), displayName: 'مربی' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function createStudent(coachToken: string) {
  const created = await call('POST', '/api/students', { phoneNumber: nextPhone(), displayName: 'شاگرد' }, coachToken);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-test-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

async function saveProgram(coachToken: string, studentId: number) {
  const saved = await call('PUT', `/api/students/${studentId}/program`, {
    title: 'برنامهٔ آزمایش', priceTomans: 99999,
    days: [{ name: 'روز اول', exercises: [{ exerciseId: 'bench-press', name: 'پرس سینه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
  }, coachToken);
  expect(saved.status).toBe(200);
  return saved.json.program as { id: string; version: number };
}

describe('the in-app notifications', () => {
  it('tells the student to send the receipt and keeps the list of one account private', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);

    expect((await call('GET', '/api/notifications', undefined, student.token)).json.notifications).toEqual([]);

    const started = await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);
    expect(started.status).toBe(201);

    const inbox = await call('GET', '/api/notifications', undefined, student.token);
    expect(inbox.status).toBe(200);
    expect(inbox.json.unread).toBe(1);
    expect(inbox.json.notifications[0]).toMatchObject({ kind: 'payment', link: '/pay/receipt' });
    expect(inbox.json.notifications[0].title).toContain('رسید');

    // The coach and the manager see nothing of the student's inbox.
    expect((await call('GET', '/api/notifications', undefined, coach.token)).json.notifications).toEqual([]);
    expect((await call('GET', '/api/notifications', undefined, admin)).json.notifications).toEqual([]);
    expect((await call('GET', '/api/notifications')).status).toBe(401);
  });

  it('marks the notifications as read, one by one or all at once', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);

    const before = await call('GET', '/api/notifications', undefined, student.token);
    const id = before.json.notifications[0].id as number;
    await call('POST', '/api/notifications/read', { ids: [id] }, student.token);
    const after = await call('GET', '/api/notifications', undefined, student.token);
    expect(after.json.unread).toBe(0);
    expect(after.json.notifications[0].readAt).toBeTruthy();

    await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);
    await call('POST', '/api/notifications/read', {}, student.token);
    expect((await call('GET', '/api/notifications', undefined, student.token)).json.unread).toBe(0);
  });

  it('shows the requests of the club to the manager and settles a receipt with one tap', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);
    const started = await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);
    const authority = started.json.authority as string;

    const list = await call('GET', '/api/admin/card-transfer/receipts', undefined, admin);
    expect(list.status).toBe(200);
    expect(list.json.requests).toHaveLength(1);
    expect(list.json.requests[0]).toMatchObject({ authority, studentName: 'شاگرد', status: 'pending' });

    // The coach must not see the list of the club.
    expect((await call('GET', '/api/admin/card-transfer/receipts', undefined, coach.token)).status).toBe(403);

    const confirmed = await call('POST', '/api/admin/card-transfer/review', { authority, action: 'confirm' }, admin);
    expect(confirmed.status).toBe(200);
    expect(confirmed.json.success).toBe(true);
    expect((await call('GET', '/api/me/program', undefined, student.token)).json.isPaid).toBe(true);

    // The student hears about it.
    const inbox = await call('GET', '/api/notifications', undefined, student.token);
    expect(inbox.json.notifications[0].title).toContain('تأیید شد');
  });
});
