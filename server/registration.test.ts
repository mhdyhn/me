// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { createSession, hashPassword, userForToken, verifyPassword } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { findUserByUsername, insertUser } from './users.ts';

let db: Db;
let server: Server;
let base: string;
let clock: Date;
const key = keyFromSecret('registration-test-secret');
const valid = { role: 'student', displayName: 'شاگرد مستقل', phoneNumber: '۰۹۱۲۳۴۵۶۷۸۹', username: 'personal.one', password: 'independent-pass-123', dataNoticeAccepted: true };

beforeEach(async () => {
  db = await openDatabase('memory');
  clock = new Date('2026-10-28T09:00:00.000Z');
  await ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, secretKey: key, now: () => clock, maxRegistrationAttempts: 30 }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

async function call(method: string, path: string, body?: unknown, token?: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any> };
}
const login = (username: string, password: string) => call('POST', '/api/auth/login', { username, password });
const register = (overrides: Record<string, unknown> = {}) => call('POST', '/api/auth/register', { ...valid, ...overrides });

async function adminToken() { return (await login('owner', 'owner-pass-123')).json.token as string; }

async function createCoach(admin: string) {
  const made = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی ساخته‌شده' }, admin);
  const token = (await login(made.json.username, made.json.password)).json.token as string;
  await call('POST', '/api/me/password', { currentPassword: made.json.password, newPassword: 'coach-new-pass-123' }, token);
  return { token, id: made.json.user.id as number };
}

describe('direct registration and existing account paths', () => {
  it('creates an independent student with a hashed password and isolated, editable personal data', async () => {
    const created = await register({ username: 'Personal.One' });
    expect(created).toMatchObject({ status: 201, json: { username: 'personal.one', pendingApproval: false } });
    expect(created.json).not.toHaveProperty('token');
    const stored = (await findUserByUsername(db, 'personal.one'))!;
    expect(stored).toMatchObject({ role: 'student', coachId: null, selfRegistered: true, isActive: true, mustChangePassword: false, phoneNumber: '09123456789' });
    expect(stored.passwordEnc).toBeNull();
    expect(stored.passwordHash).not.toContain(valid.password);
    expect(verifyPassword(valid.password, stored.passwordHash)).toBe(true);
    const session = await login('personal.one', valid.password);
    expect(session.status).toBe(200);
    const token = session.json.token as string;
    expect((await call('GET', '/api/me/program', undefined, token)).json).toMatchObject({ program: null, coachName: null });
    expect((await call('GET', '/api/me/chat', undefined, token)).status).toBe(409);
    expect((await call('POST', '/api/me/chat', { body: 'سلام' }, token)).status).toBe(409);
    expect((await call('POST', '/api/me/profile/sharing', { shareWithCoach: true }, token)).status).toBe(409);
    const day = { id: 'personal-day', name: 'روز من', focus: '', dayLabel: 'روز اول', durationMinutes: 30, description: '', exercises: [] };
    const saved = await call('POST', '/api/me/personal-data/batch', { accountId: stored.id, changes: [{ kind: 'program', key: 'main', baseVersion: 0, operationId: 'signup-program-01', deleted: false, value: [day] }] }, token);
    expect(saved.json.results[0].status).toBe('saved');
    const list = await call('GET', `/api/me/personal-data?accountId=${stored.id}`, undefined, token);
    expect(list.json.records.find((item: { kind: string }) => item.kind === 'program').value).toEqual([day]);
    const other = await register({ username: 'another.person' });
    expect(other.status).toBe(201);
    const otherSession = await login('another.person', valid.password);
    const otherToken = otherSession.json.token as string;
    expect((await call('GET', `/api/me/personal-data?accountId=${stored.id}`, undefined, otherToken)).status).toBe(409);
    expect((await call('GET', `/api/me/personal-data?accountId=${otherSession.json.user.id}`, undefined, otherToken)).json.records).toEqual([]);
  });

  it('requires admin approval for a self-registered coach while preserving manual coach and student creation', async () => {
    expect((await register({ role: 'coach', username: 'coach.self', displayName: 'مربی خودثبت‌نام' })).json.pendingApproval).toBe(true);
    const pending = (await findUserByUsername(db, 'coach.self'))!;
    expect(pending).toMatchObject({ role: 'coach', coachId: null, isActive: false, pendingApproval: true, passwordEnc: null });
    const blocked = await login('coach.self', valid.password);
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toContain('در انتظار تأیید');
    expect((await call('GET', '/api/students')).status).toBe(401);
    const admin = await adminToken();
    expect((await call('POST', '/api/coaches', { displayName: 'بدون موبایل' }, admin)).status).toBe(400);
    const coaches = (await call('GET', '/api/coaches', undefined, admin)).json.coaches;
    expect(coaches.find((coach: { id: number }) => coach.id === pending.id)).toMatchObject({ pendingApproval: true, password: null });
    expect((await call('PUT', `/api/coaches/${pending.id}/active`, { active: true }, admin)).status).toBe(200);
    const accepted = await login('coach.self', valid.password);
    expect(accepted.status).toBe(200);
    expect(accepted.json.user.pendingApproval).toBe(false);
    expect((await call('POST', '/api/students', { displayName: 'بدون موبایل' }, accepted.json.token)).status).toBe(400);
    const fromRegisteredCoach = await call('POST', '/api/students', { phoneNumber: '+98 912 123 4567', displayName: 'شاگرد مربی' }, accepted.json.token);
    expect(fromRegisteredCoach.status).toBe(201);
    expect(fromRegisteredCoach.json.user).toMatchObject({ coachId: pending.id, selfRegistered: false, mustChangePassword: true, phoneNumber: '09121234567' });
    const manualCoach = await createCoach(admin);
    const manualStudent = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد دستی' }, manualCoach.token);
    expect(manualStudent.status).toBe(201);
    expect(manualStudent.json.user.coachId).toBe(manualCoach.id);
    expect((await call('GET', '/api/students', undefined, manualCoach.token)).json.students.map((student: { id: number }) => student.id)).not.toContain(fromRegisteredCoach.json.user.id);
    expect((await register({ username: 'directory.personal' })).status).toBe(201);
    const directory = (await call('GET', '/api/admin/students', undefined, admin)).json.students;
    expect(directory).toEqual(expect.arrayContaining([
      expect.objectContaining({ username: 'directory.personal', selfRegistered: true, coachId: null }),
      expect.objectContaining({ id: fromRegisteredCoach.json.user.id, selfRegistered: false, coachId: pending.id, phoneNumber: '09121234567' }),
      expect.objectContaining({ id: manualStudent.json.user.id, selfRegistered: false, coachId: manualCoach.id }),
    ]));
  });

  it('rejects role escalation, missing notice, invalid input, duplicate usernames and cross-origin submission', async () => {
    expect((await register({ role: 'admin' })).status).toBe(400);
    expect((await register({ dataNoticeAccepted: false })).status).toBe(400);
    expect((await register({ username: 'نام‌فارسی' })).status).toBe(400);
    expect((await register({ password: 'short' })).status).toBe(400);
    expect((await register({ phoneNumber: '' })).status).toBe(400);
    expect((await register({ phoneNumber: '1234' })).status).toBe(400);
    expect((await register({ role: 'student', coachId: 1, pendingApproval: false, isActive: true, selfRegistered: false })).status).toBe(201);
    expect((await findUserByUsername(db, valid.username))?.coachId).toBeNull();
    expect((await register({ username: 'PERSONAL.ONE' })).status).toBe(409);
    expect((await call('POST', '/api/auth/register', { ...valid, username: 'from-elsewhere' }, undefined, { Origin: 'https://attacker.example' })).status).toBe(403);
    const text = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(valid) });
    expect(text.status).toBe(415);
  });

  it('exposes independent accounts only to admin and supports a manual reset after identity checks', async () => {
    await register();
    const student = (await findUserByUsername(db, valid.username))!;
    const token = (await login(valid.username, valid.password)).json.token as string;
    const admin = await adminToken();
    const coach = await createCoach(admin);
    expect((await call('GET', '/api/admin/students', undefined, token)).status).toBe(403);
    expect((await call('GET', '/api/admin/students', undefined, coach.token)).status).toBe(403);
    expect((await call('GET', '/api/admin/students?username=PERSONAL.ONE', undefined, admin)).json.students).toMatchObject([{ id: student.id, username: valid.username }]);
    expect((await call('GET', '/api/admin/students?username=no-such-user', undefined, admin)).json.students).toEqual([]);
    expect((await call('POST', `/api/students/${student.id}/reset-password`, {}, coach.token)).status).toBe(404);
    const reset = await call('POST', `/api/students/${student.id}/reset-password`, {}, admin);
    expect(reset.status).toBe(200);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);
    expect((await login(valid.username, valid.password)).status).toBe(401);
    const replacement = await login(valid.username, reset.json.password);
    expect(replacement.status).toBe(200);
    expect(replacement.json.user.mustChangePassword).toBe(true);
  });

  it('pages the unified directory without duplicates and lets admin search beyond the first page', async () => {
    const admin = await adminToken();
    const ids: number[] = [];
    for (let n = 0; n < 35; n++) ids.push(await insertUser(db, { username: `directory.${n}`, passwordHash: 'not-used', role: 'student', displayName: `شاگرد ${n}`, phoneNumber: '09123456789', coachId: null, selfRegistered: true, mustChangePassword: false, now: clock }));
    const first = (await call('GET', '/api/admin/students', undefined, admin)).json;
    expect(first.students).toHaveLength(30);
    expect(first.nextCursor).toBeTruthy();
    const second = (await call('GET', `/api/admin/students?before=${first.nextCursor}`, undefined, admin)).json;
    expect(second.students).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.students, ...second.students].map((row: { id: number }) => row.id))).toEqual(new Set(ids));
    expect((await call('GET', '/api/admin/students?username=directory.0', undefined, admin)).json.students).toMatchObject([{ id: ids[0] }]);
    expect((await call('GET', '/api/admin/students?before=-1', undefined, admin)).status).toBe(400);
  });

  it('separates sources only behind an explicitly trusted proxy and ignores a spoofed earlier hop', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer(createApp({ db, secretKey: key, now: () => clock, maxRegistrationAttempts: 2, trustedProxyRanges: ['127.0.0.1/32'] }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const attempt = (header: string) => call('POST', '/api/auth/register', { ...valid, role: 'admin' }, undefined, { 'X-Forwarded-For': header });
    expect((await attempt('203.0.113.1, 198.51.100.10')).status).toBe(400);
    expect((await attempt('203.0.113.2, 198.51.100.10')).status).toBe(400);
    expect((await attempt('203.0.113.3, 198.51.100.10')).status).toBe(429);
    expect((await attempt('203.0.113.1, 198.51.100.11')).status).toBe(400);
    const buckets = await db.query<{ bucket: string }>('SELECT bucket FROM registration_attempts');
    expect(buckets.every((row) => !row.bucket.includes('198.51.100'))).toBe(true);
  });

  it('enforces a persistent per-socket rate limit without trusting spoofed forwarded addresses', async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer(createApp({ db, secretKey: key, now: () => clock, maxRegistrationAttempts: 2 }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const forged of ['10.0.0.1', '10.0.0.2']) {
      expect((await call('POST', '/api/auth/register', { ...valid, role: 'admin' }, undefined, { 'X-Forwarded-For': forged })).status).toBe(400);
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    server = createServer(createApp({ db, secretKey: key, now: () => clock, maxRegistrationAttempts: 2 }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect((await call('POST', '/api/auth/register', valid, undefined, { 'X-Forwarded-For': '10.0.0.3' })).status).toBe(429);
    const buckets = await db.query<{ bucket: string }>('SELECT bucket FROM registration_attempts');
    expect(buckets.every((row) => !row.bucket.includes('127.0.0.1') && !row.bucket.includes('10.0.0'))).toBe(true);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    expect((await register()).status).toBe(201);
  });
});

describe('legacy data migration', () => {
  it('replaces the old mandatory-coach check without losing sessions, programmes or payments, including on repeated startup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'meety-registration-migration-'));
    let legacy: Db | undefined;
    try {
      legacy = await openDatabase(dir);
      const admin = await insertUser(legacy, { username: 'legacy-admin', passwordHash: hashPassword('legacy-admin-pass'), role: 'admin', displayName: 'مدیر', coachId: null, mustChangePassword: false, now: clock });
      const coach = await insertUser(legacy, { username: 'legacy-coach', passwordHash: hashPassword('legacy-coach-pass'), role: 'coach', displayName: 'مربی', coachId: null, mustChangePassword: false, now: clock });
      const student = await insertUser(legacy, { username: 'legacy-student', passwordHash: hashPassword('legacy-student-pass'), role: 'student', displayName: 'شاگرد', coachId: coach, mustChangePassword: false, now: clock });
      const token = (await createSession(legacy, student, 0, clock))!;
      await legacy.query("INSERT INTO student_programs (student_id, coach_id, body, updated_at, price_tomans, programme_id, version) VALUES ($1, $2, $3, $4, 100, 'old-offer', 1)", [student, coach, JSON.stringify({ title: 'برنامهٔ قدیمی', days: [] }), clock.toISOString()]);
      await legacy.query("INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, programme_id, programme_mapping) VALUES ($1, $2, 100, 90, 10, 'old-authority', 'paid', 'old-ref', $3, 'old-offer', 'explicit')", [student, coach, clock.toISOString()]);
      await legacy.exec("ALTER TABLE users DROP CONSTRAINT users_coach_role_check; ALTER TABLE users ADD CONSTRAINT original_coach_required CHECK ((role = 'student') = (coach_id IS NOT NULL)); ALTER TABLE users ADD CONSTRAINT unrelated_check CHECK ((role <> 'student') OR coach_id IS NOT NULL OR username <> 'forbidden'); ALTER TABLE users DROP COLUMN phone_number, DROP COLUMN self_registered, DROP COLUMN pending_approval, DROP COLUMN coach_access, DROP COLUMN coach_access_version;");
      await legacy.close(); legacy = undefined;
      for (let startup = 0; startup < 2; startup++) {
        legacy = await openDatabase(dir);
        expect(await userForToken(legacy, token, clock)).toEqual({ userId: student });
        expect((await legacy.query('SELECT programme_id, body FROM student_programs WHERE student_id = $1', [student]))[0]).toMatchObject({ programme_id: 'old-offer' });
        expect((await legacy.query('SELECT authority, status, ref_id FROM payment_transactions WHERE student_id = $1', [student]))[0]).toMatchObject({ authority: 'old-authority', status: 'paid', ref_id: 'old-ref' });
        expect(await findUserByUsername(legacy, 'legacy-student')).toMatchObject({ coachId: coach, phoneNumber: null, selfRegistered: false });
        expect((await findUserByUsername(legacy, 'legacy-admin'))?.id).toBe(admin);
        expect(await legacy.query("SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'unrelated_check'")).toHaveLength(1);
        if (startup === 0) await insertUser(legacy, { username: 'new-independent', passwordHash: hashPassword('new-personal-pass'), role: 'student', displayName: 'مستقل', coachId: null, mustChangePassword: false, now: clock });
        await legacy.close(); legacy = undefined;
      }
    } finally {
      await legacy?.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 60000);
});
