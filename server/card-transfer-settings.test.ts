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
  return `0912${String(2340000 + phoneSequence)}`;
}

type Json = Record<string, any>;
let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-10-30T08:00:00Z');
const ENV_CARD = '6037999912345678';
const PANEL_CARD = '6219860012345678';

beforeEach(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
  vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', ENV_CARD);
  vi.stubEnv('CARD_TRANSFER_CARD_HOLDER', 'شرکت میتی');
  vi.stubEnv('CARD_TRANSFER_EXPIRY_HOURS', '72');
  vi.stubEnv('CARD_TRANSFER_MAX_PER_DAY', '3');
  vi.stubEnv('CARD_TRANSFER_UNIQUE_AMOUNT', 'on');
  vi.stubEnv('CARD_TRANSFER_VERIFY_URL', '');
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('card-transfer-settings-suite-secret') }));
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

function settingsBody(overrides: Record<string, unknown> = {}) {
  return { cardNumber: PANEL_CARD, cardHolder: 'میتی', bankName: 'ملت', expiryHours: 48, maxPerDay: 2, uniqueAmount: true, ...overrides };
}

describe('the card-transfer settings of the panel', () => {
  it('lets the admin switch the payment on when the environment has no card', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);

    // The environment has no card: this is the error the students saw.
    vi.stubEnv('CARD_TRANSFER_CARD_NUMBER', '');
    expect((await call('GET', '/api/pay/card-transfer/availability', undefined, student.token)).json.available).toBe(false);
    expect((await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token)).status).toBe(503);

    const saved = await call('PUT', '/api/admin/card-transfer', settingsBody(), admin);
    expect(saved.status).toBe(200);
    expect(saved.json.enabled).toBe(true);

    const availability = await call('GET', '/api/pay/card-transfer/availability', undefined, student.token);
    expect(availability.json.available).toBe(true);
    expect(availability.json.cardHolder).toBe('میتی');
    expect(availability.json.bankName).toBe('ملت');

    const started = await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);
    expect(started.status).toBe(201);
    expect(started.json.cardNumber).toBe(PANEL_CARD);
  });

  it('prefers the saved card over the environment and switches the payment off again', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);
    const student = await createStudent(coach.token);
    const program = await saveProgram(coach.token, student.id);

    const state = await call('GET', '/api/admin/card-transfer', undefined, admin);
    expect(state.status).toBe(200);
    expect(state.json.source).toBe('environment');
    expect(state.json.settings.cardNumber).toBe(ENV_CARD);

    await call('PUT', '/api/admin/card-transfer', settingsBody(), admin);
    const started = await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token);
    expect(started.json.cardNumber).toBe(PANEL_CARD);

    // An empty card number closes the payment.
    const closed = await call('PUT', '/api/admin/card-transfer', settingsBody({ cardNumber: '', cardHolder: '' }), admin);
    expect(closed.status).toBe(200);
    expect(closed.json.enabled).toBe(false);
    expect((await call('GET', '/api/pay/card-transfer/availability', undefined, student.token)).json.available).toBe(false);
    expect((await call('POST', '/api/pay/card-transfer/start', { expectedId: program.id, expectedVersion: program.version }, student.token)).status).toBe(503);
  });

  it('refuses a broken card number, a missing holder and anybody who is not the admin', async () => {
    const admin = await signIn('owner', 'owner-pass-123');
    const coach = await createCoach(admin);

    expect((await call('PUT', '/api/admin/card-transfer', settingsBody({ cardNumber: '12345' }), admin)).status).toBe(400);
    expect((await call('PUT', '/api/admin/card-transfer', settingsBody({ cardHolder: '  ' }), admin)).status).toBe(400);
    expect((await call('GET', '/api/admin/card-transfer', undefined, coach.token)).status).toBe(403);
    expect((await call('PUT', '/api/admin/card-transfer', settingsBody(), coach.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/card-transfer')).status).toBe(401);
  });
});
