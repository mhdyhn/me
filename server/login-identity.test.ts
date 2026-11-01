// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

type Json = Record<string, any>;

/** The password the coach account has after it changed its temporary one. */
const COACH_PASSWORD = 'coach-new-pass-1';

let db: Db;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  db = await openDatabase('memory');
  clock = new Date('2026-10-13T08:00:00Z');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('test-secret-for-the-suite') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Json };
}

async function login(username: string, password: string) {
  return call('POST', '/api/auth/login', { username, password });
}

/** The admin signs in, creates a coach and returns the admin and the coach session. */
async function coachSession(phoneNumber = '09121234000', username?: string) {
  const admin = (await login('owner', 'owner-pass-123')).json.token as string;
  const created = await call('POST', '/api/coaches', { phoneNumber, displayName: 'مربی', ...(username ? { username } : {}) }, admin);
  const coach = (await login(created.json.username, created.json.password)).json.token as string;
  // A new account has to change its temporary password before it may do anything else.
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: COACH_PASSWORD }, coach);
  return { admin, coach, created, password: COACH_PASSWORD };
}

describe('the name that an account signs in with', () => {
  it('accepts a name written with a capital letter', async () => {
    const { created, password } = await coachSession('09121234001', 'maryam');
    expect(created.json.username).toBe('maryam');
    const signedIn = await login('Maryam', password);
    expect(signedIn.status).toBe(200);
    expect(signedIn.json.user.username).toBe('maryam');
  });

  it('accepts the phone number in every way it is written', async () => {
    const { password } = await coachSession('09121234002');
    for (const spelling of ['09121234002', '+989121234002', '00989121234002', '0912 123 4002', '۰۹۱۲۱۲۳۴۰۰۲']) {
      const signedIn = await login(spelling, password);
      expect(signedIn.status, spelling).toBe(200);
      expect(signedIn.json.user.username).toBe('09121234002');
    }
  });

  it('counts the failed attempts of one account together, whatever the spelling', async () => {
    const { password } = await coachSession('09121234003');
    for (const spelling of ['09121234003', '+989121234003', '00989121234003', '0912 123 4003', '۰۹۱۲۱۲۳۴۰۰۳']) {
      expect((await login(spelling, 'wrong-wrong-1')).status).toBe(401);
    }
    // The account is locked now, and the correct password does not open it.
    expect((await login('09121234003', password)).status).toBe(429);
  });

  it('signs in with the account of a phone number that several accounts share', async () => {
    const { coach } = await coachSession('09121234004');
    const first = await call('POST', '/api/students', { phoneNumber: '09121234005', displayName: 'شاگرد یک' }, coach);
    const second = await call('POST', '/api/students', { phoneNumber: '09121234005', displayName: 'شاگرد دو' }, coach);
    expect(first.json.username).toBe('09121234005');
    expect(second.json.username).toBe('09121234005-2');
    // The password of the second account opens the second account, not the first one.
    const signedIn = await login('09121234005', second.json.password);
    expect(signedIn.status).toBe(200);
    expect(signedIn.json.user.username).toBe('09121234005-2');
    expect(signedIn.json.user.displayName).toBe('شاگرد دو');
  });

  it('asks for the name when the same password fits more than one account', async () => {
    const { coach } = await coachSession('09121234006');
    const first = await call('POST', '/api/students', { phoneNumber: '09121234007', displayName: 'شاگرد یک' }, coach);
    const second = await call('POST', '/api/students', { phoneNumber: '09121234007', displayName: 'شاگرد دو' }, coach);
    const shared = hashPassword('shared-pass-1234');
    await db.query('UPDATE users SET password_hash = $1 WHERE id = ANY($2::int[])', [shared, [first.json.user.id, second.json.user.id]]);
    const signedIn = await login('09121234007', 'shared-pass-1234');
    expect(signedIn.status).toBe(409);
    expect(String(signedIn.json.error)).toContain('نام کاربری');
    // The first account is not used either, so no one lands in the wrong account.
    expect(first.json.username).toBe('09121234007');
  });

  it('finds every student of a phone number in the list of the admin', async () => {
    const { admin, coach } = await coachSession('09121234008');
    await call('POST', '/api/students', { phoneNumber: '09121234009', displayName: 'شاگرد یک' }, coach);
    await call('POST', '/api/students', { phoneNumber: '09121234009', displayName: 'شاگرد دو' }, coach);
    const found = await call('GET', '/api/admin/students?username=09121234009', undefined, admin);
    expect(found.status).toBe(200);
    const names = found.json.students.map((student: Json) => student.username).sort();
    expect(names).toEqual(['09121234009', '09121234009-2']);
  });
});
