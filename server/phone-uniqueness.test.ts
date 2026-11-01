// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { hashPassword } from './auth.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { migrateRegistration } from './registration.ts';
import { insertUser } from './users.ts';

type Json = Record<string, any>;

let db: Db;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  db = await openDatabase('memory');
  clock = new Date('2026-10-13T08:00:00Z');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock, secretKey: keyFromSecret('phone-suite-secret') }));
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

/** The admin signs in and creates a coach with a mobile number. */
async function coachSession(phoneNumber = '09121234000') {
  const admin = (await login('owner', 'owner-pass-123')).json.token as string;
  const created = await call('POST', '/api/coaches', { phoneNumber, displayName: 'مربی' }, admin);
  const coach = (await login(created.json.username, created.json.password)).json.token as string;
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-new-pass-1' }, coach);
  return { admin, coach, created };
}

/** A student who signed up on their own. */
async function registerStudent(phoneNumber: string, username = 'maryam') {
  return call('POST', '/api/auth/register', {
    role: 'student', phoneNumber, username, password: 'student-password-1', displayName: 'شاگرد', dataNoticeAccepted: true,
  });
}

describe('one account per mobile number', () => {
  it('refuses a second coach with a number that already belongs to an account', async () => {
    const { admin, created } = await coachSession('09121234000');
    expect(created.json.username).toBe('09121234000');
    const second = await call('POST', '/api/coaches', { phoneNumber: '09121234000', displayName: 'مربی دوم' }, admin);
    expect(second.status).toBe(409);
    expect(second.json.error).toContain('قبلاً برای یک حساب ثبت شده است');
    expect((await db.query('SELECT * FROM users WHERE phone_number = $1', ['09121234000']))).toHaveLength(1);
  });

  it('refuses a second student with the number of the coach who creates them', async () => {
    const { coach } = await coachSession('09121234000');
    const student = await call('POST', '/api/students', { phoneNumber: '09121234001', displayName: 'شاگرد' }, coach);
    expect(student.status).toBe(201);
    const again = await call('POST', '/api/students', { phoneNumber: '09121234001', displayName: 'شاگرد دوم' }, coach);
    expect(again.status).toBe(409);
    expect(again.json.error).toContain('قبلاً برای یک حساب ثبت شده است');
    expect((await db.query('SELECT * FROM users WHERE phone_number = $1', ['09121234001']))).toHaveLength(1);
  });

  it('refuses a self-registration with a number that is already in use', async () => {
    const { coach } = await coachSession('09121234000');
    const student = await registerStudent('09121234002');
    expect(student.status).toBe(201);
    const again = await registerStudent('09121234002');
    expect(again.status).toBe(409);
    expect(again.json.error).toContain('قبلاً برای یک حساب ثبت شده است');
    // The coach of that student cannot open a second account with the same number either.
    const byCoach = await call('POST', '/api/students', { phoneNumber: '09121234002', displayName: 'شاگرد دیگر' }, coach);
    expect(byCoach.status).toBe(409);
    expect((await db.query('SELECT * FROM users WHERE phone_number = $1', ['09121234002']))).toHaveLength(1);
  });

  it('treats every way of writing the same number as the same number', async () => {
    await registerStudent('09121234003');
    for (const written of ['09121234003', '+989121234003', '00989121234003', '0912 123 4003', '۰۹۱۲۱۲۳۴۰۰۳']) {
      const again = await registerStudent(written, `user${Math.random().toString(36).slice(2, 8)}`);
      expect(again.status).toBe(409);
    }
    expect((await db.query('SELECT * FROM users WHERE phone_number = $1', ['09121234003']))).toHaveLength(1);
  });

  it('keeps the number out of a second account even when the request is sent at the same moment', async () => {
    const { admin } = await coachSession('09121234000');
    const results = await Promise.all([
      call('POST', '/api/coaches', { phoneNumber: '09121234009', displayName: 'مربی الف' }, admin),
      call('POST', '/api/coaches', { phoneNumber: '09121234009', displayName: 'مربی ب' }, admin),
    ]);
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(1);
    expect((await db.query('SELECT * FROM users WHERE phone_number = $1', ['09121234009']))).toHaveLength(1);
  });

  it('lets the owner of the number sign in with it and keeps the account of that number', async () => {
    const { created } = await coachSession('09121234000');
    const signedIn = await login('09121234000', 'coach-new-pass-1');
    expect(signedIn.status).toBe(200);
    expect(signedIn.json.user.id).toBe(created.json.user.id);
    const byPhone = await login('09121234000', created.json.password);
    expect(byPhone.status).toBe(401);
  });

  it('refuses a second account with the same number straight in the database', async () => {
    await registerStudent('09121234005');
    await expect(db.query(
      `INSERT INTO users (username, password_hash, role, display_name, must_change_password, created_at, phone_number)
       VALUES ('second-account', 'not-used', 'student', 'شاگرد دوم', 0, $1, '09121234005')`,
      [clock.toISOString()],
    )).rejects.toMatchObject({ code: '23505' });
  });

  it('keeps the number on the account whose username is the number when an old database has it twice', async () => {
    // An old database could hold the same number twice; the migration keeps one of them.
    await db.exec('DROP INDEX IF EXISTS idx_users_phone_number');
    const first = await insertUser(db, {
      username: '09121234006', passwordHash: hashPassword('first-password-1'), role: 'student', displayName: 'شاگرد اول',
      phoneNumber: '09121234006', coachId: null, selfRegistered: true, mustChangePassword: false, now: clock,
    });
    const second = await insertUser(db, {
      username: '09121234006-2', passwordHash: hashPassword('second-password-1'), role: 'student', displayName: 'شاگرد دوم',
      phoneNumber: '09121234006', coachId: null, selfRegistered: true, mustChangePassword: false, now: clock,
    });
    await migrateRegistration(db);
    const kept = await db.query<{ id: number; phone_number: string | null }>('SELECT id, phone_number FROM users WHERE id = $1', [first]);
    const dropped = await db.query<{ id: number; phone_number: string | null }>('SELECT id, phone_number FROM users WHERE id = $1', [second]);
    expect(kept[0]!.phone_number).toBe('09121234006');
    expect(dropped[0]!.phone_number).toBeNull();
    // The second account can still sign in with its own username.
    const signedIn = await login('09121234006-2', 'second-password-1');
    expect(signedIn.status).toBe(200);
    expect(signedIn.json.user.id).toBe(second);
    // And the number opens only the first account.
    const byNumber = await login('09121234006', 'first-password-1');
    expect(byNumber.status).toBe(200);
    expect(byNumber.json.user.id).toBe(first);
  });
});
