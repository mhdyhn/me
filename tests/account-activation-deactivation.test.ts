// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../server/app.ts';
import { keyFromSecret } from '../server/secrets.ts';
import { ensureAdmin } from '../server/bootstrap.ts';
import { openDatabase, type Db } from '../server/db.ts';

type Json = Record<string, any>;

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

async function call(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: Json; headers: Headers }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: (await response.json()) as Json, headers: response.headers };
}

async function login(username: string, password: string) {
  return call('POST', '/api/auth/login', { username, password });
}

async function setupCoach() {
  const admin = (await login('owner', 'owner-pass-123')).json.token as string;
  const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی اصلی' }, admin);
  const coachLogin = await login(created.json.username, created.json.password);
  const token = coachLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-new-pass-1' }, token);
  return { token, id: created.json.user.id as number, username: created.json.username as string, adminToken: admin };
}

async function setupStudent(coachToken: string) {
  const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد هدف' }, coachToken);
  const studentLogin = await login(created.json.username, created.json.password);
  const token = studentLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-1' }, token);
  return { token, id: created.json.user.id as number, username: created.json.username as string };
}

describe('Account Activation and Deactivation', () => {
  it('Coach can deactivate and reactivate their own student', async () => {
    const { token: coachToken } = await setupCoach();
    const student = await setupStudent(coachToken);

    // Verify student is initially active
    const meBefore = await call('GET', '/api/me', undefined, student.token);
    expect(meBefore.status).toBe(200);
    expect(meBefore.json.user.isActive).toBe(true);

    // Coach deactivates the student
    const deactRes = await call('PUT', `/api/students/${student.id}/active`, { active: false }, coachToken);
    expect(deactRes.status).toBe(200);
    expect(deactRes.json.isActive).toBe(false);

    // Existing session token is immediately blocked/deleted
    const accessBlocked = await call('GET', '/api/me', undefined, student.token);
    expect(accessBlocked.status).toBe(401);

    // Trying to log in with valid credentials returns 403 Forbidden with clear message
    const loginAttempt = await login(student.username, 'student-new-pass-1');
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.json.error).toBe('حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.');

    // Coach reactivates the student
    const reactRes = await call('PUT', `/api/students/${student.id}/active`, { active: true }, coachToken);
    expect(reactRes.status).toBe(200);
    expect(reactRes.json.isActive).toBe(true);

    // Student can now log in successfully again
    const loginAgain = await login(student.username, 'student-new-pass-1');
    expect(loginAgain.status).toBe(200);
    expect(loginAgain.json.user.isActive).toBe(true);
  });

  it('Admin can deactivate and reactivate a coach', async () => {
    const { token: coachToken, id: coachId, username: coachUsername, adminToken } = await setupCoach();

    // Verify coach can access coach routes
    const coachCheck = await call('GET', '/api/students', undefined, coachToken);
    expect(coachCheck.status).toBe(200);

    // Admin deactivates the coach
    const deactRes = await call('PUT', `/api/coaches/${coachId}/active`, { active: false }, adminToken);
    expect(deactRes.status).toBe(200);
    expect(deactRes.json.isActive).toBe(false);

    // Coach existing token is revoked
    const coachBlocked = await call('GET', '/api/students', undefined, coachToken);
    expect(coachBlocked.status).toBe(401);

    // Coach cannot log in
    const loginAttempt = await login(coachUsername, 'coach-new-pass-1');
    expect(loginAttempt.status).toBe(403);
    expect(loginAttempt.json.error).toContain('غیرفعال');

    // Admin reactivates the coach
    const reactRes = await call('PUT', `/api/coaches/${coachId}/active`, { active: true }, adminToken);
    expect(reactRes.status).toBe(200);
    expect(reactRes.json.isActive).toBe(true);

    // Coach can log in again
    const loginAgain = await login(coachUsername, 'coach-new-pass-1');
    expect(loginAgain.status).toBe(200);
    expect(loginAgain.json.user.isActive).toBe(true);
  });

  it('Admin can view a coach\'s students and deactivate/activate a student directly', async () => {
    const { token: coachToken, id: coachId, adminToken } = await setupCoach();
    const student = await setupStudent(coachToken);

    // Admin lists the students for this coach
    const listRes = await call('GET', `/api/admin/coaches/${coachId}/students`, undefined, adminToken);
    expect(listRes.status).toBe(200);
    expect(listRes.json.coachName).toBe('مربی اصلی');
    expect(listRes.json.students).toEqual([
      expect.objectContaining({
        id: student.id,
        displayName: 'شاگرد هدف',
        isActive: true,
      }),
    ]);

    // Admin deactivates the student directly
    const deactStudent = await call('PUT', `/api/students/${student.id}/active`, { active: false }, adminToken);
    expect(deactStudent.status).toBe(200);
    expect(deactStudent.json.isActive).toBe(false);

    // Student is now blocked
    const studentBlocked = await login(student.username, 'student-new-pass-1');
    expect(studentBlocked.status).toBe(403);
    expect(studentBlocked.json.error).toContain('غیرفعال');

    // Admin reactivates the student directly
    const reactStudent = await call('PUT', `/api/students/${student.id}/active`, { active: true }, adminToken);
    expect(reactStudent.status).toBe(200);
    expect(reactStudent.json.isActive).toBe(true);

    // Student can log in again
    const studentOk = await login(student.username, 'student-new-pass-1');
    expect(studentOk.status).toBe(200);
  });

  it('does not restore old coach or student sessions when an account is quickly reactivated', async () => {
    const { token: coachToken, id: coachId, username: coachUsername, adminToken } = await setupCoach();
    const student = await setupStudent(coachToken);

    expect((await call('PUT', `/api/students/${student.id}/active`, { active: false }, adminToken)).status).toBe(200);
    expect((await call('PUT', `/api/students/${student.id}/active`, { active: true }, adminToken)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, student.token)).status).toBe(401);
    expect((await login(student.username, 'student-new-pass-1')).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, coachToken)).status).toBe(200);

    expect((await call('PUT', `/api/coaches/${coachId}/active`, { active: false }, adminToken)).status).toBe(200);
    expect((await call('PUT', `/api/coaches/${coachId}/active`, { active: true }, adminToken)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, coachToken)).status).toBe(401);
    expect((await login(coachUsername, 'coach-new-pass-1')).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, adminToken)).status).toBe(200);
  });

  it('Coach cannot deactivate a student of another coach', async () => {
    const coach1 = await setupCoach();
    const student1 = await setupStudent(coach1.token);

    // Create coach2
    const admin = coach1.adminToken;
    const coach2Created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی دوم' }, admin);
    const coach2Login = await login(coach2Created.json.username, coach2Created.json.password);
    await call('POST', '/api/me/password', { currentPassword: coach2Created.json.password, newPassword: 'coach2-pass-1' }, coach2Login.json.token);
    const coach2Token = (await login(coach2Created.json.username, 'coach2-pass-1')).json.token as string;

    // Coach2 attempts to deactivate Coach1's student
    const forbidden = await call('PUT', `/api/students/${student1.id}/active`, { active: false }, coach2Token);
    expect(forbidden.status).toBe(404);
  });
});
