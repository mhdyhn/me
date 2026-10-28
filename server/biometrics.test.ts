// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

type Json = Record<string, any>;

let db: Db;
let server: Server;
let base: string;
const clock = new Date('2026-10-15T08:00:00Z');

beforeEach(async () => {
  db = await openDatabase('memory');
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

async function setupCoachAndStudent() {
  const adminRes = await login('owner', 'owner-pass-123');
  const adminToken = adminRes.json.token as string;

  const coachRes = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی برتر' }, adminToken);
  const coachLogin = await login(coachRes.json.username, coachRes.json.password);
  const coachToken = coachLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: coachRes.json.password, newPassword: 'coach-new-pass-123' }, coachToken);

  const studentRes = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد نمونه' }, coachToken);
  const studentLogin = await login(studentRes.json.username, studentRes.json.password);
  const studentToken = studentLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: studentRes.json.password, newPassword: 'student-new-pass-123' }, studentToken);

  return {
    adminToken,
    coachToken,
    studentToken,
    studentId: studentRes.json.user.id as number,
  };
}

describe('AI Modules and Student Biometrics API', () => {
  it('returns default biometrics and all 4 enabled modules initially for a student', async () => {
    const { studentToken } = await setupCoachAndStudent();
    const res = await call('GET', '/api/me/ai-settings', undefined, studentToken);

    expect(res.status).toBe(200);
    expect(res.json.biometrics.enabledModules).toEqual(['recovery', 'muscles', 'hinge', 'noom']);
    expect(res.json.biometrics.zones).toHaveLength(5);
  });

  it('allows coach to toggle AI modules and save student biometrics (age, RHR, limitations)', async () => {
    const { coachToken, studentId, studentToken } = await setupCoachAndStudent();

    // Coach enables only recovery and hinge, sets age 30, resting HR 58, and limitations
    const updateRes = await call(
      'PUT',
      `/api/students/${studentId}/ai-settings`,
      {
        enabledModules: ['recovery', 'hinge'],
        age: 30,
        restingHr: 58,
        maxHrMethod: 'tanaka',
        limitations: 'فتق دیسک کمری خفیف، اجتناب از حرکات پرشی',
      },
      coachToken,
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.json.biometrics.enabledModules).toEqual(['recovery', 'hinge']);
    expect(updateRes.json.biometrics.age).toBe(30);
    expect(updateRes.json.biometrics.restingHr).toBe(58);
    // Tanaka formula: 208 - (0.7 * 30) = 187
    expect(updateRes.json.biometrics.maxHr).toBe(187);
    expect(updateRes.json.biometrics.limitations).toContain('فتق دیسک کمری');

    // Check Karvonen HRR zones calculation: HRR = 187 - 58 = 129
    // Zone 1: 58 + 0.5 * 129 = 123 to 58 + 0.6 * 129 = 135
    expect(updateRes.json.biometrics.zones[0].minBpm).toBe(123);
    expect(updateRes.json.biometrics.zones[0].maxBpm).toBe(135);

    // Now student reads their own settings and gets the updated modules
    const studentView = await call('GET', '/api/me/ai-settings', undefined, studentToken);
    expect(studentView.status).toBe(200);
    expect(studentView.json.biometrics.enabledModules).toEqual(['recovery', 'hinge']);
    expect(studentView.json.biometrics.limitations).toContain('فتق دیسک کمری');
  });

  it('prevents a coach from modifying another coach\'s student biometrics', async () => {
    const first = await setupCoachAndStudent();
    const adminRes = await login('owner', 'owner-pass-123');
    const adminToken = adminRes.json.token as string;

    const secondCoach = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی دوم' }, adminToken);
    const secondLogin = await login(secondCoach.json.username, secondCoach.json.password);
    const secondCoachToken = secondLogin.json.token as string;
    await call('POST', '/api/me/password', { currentPassword: secondCoach.json.password, newPassword: 'coach-2-pass-123' }, secondCoachToken);

    const forbidden = await call(
      'PUT',
      `/api/students/${first.studentId}/ai-settings`,
      { enabledModules: ['recovery'] },
      secondCoachToken,
    );

    expect(forbidden.status).toBe(404);
  });

  it('rejects an empty custom peak and incompatible resting heart rate while preserving a saved custom peak on partial updates', async () => {
    const { coachToken, studentId } = await setupCoachAndStudent();
    const path = `/api/students/${studentId}/ai-settings`;
    const missing = await call('PUT', path, { maxHrMethod: 'custom', maxHr: null }, coachToken);
    expect(missing.status).toBe(400);
    const invalid = await call('PUT', path, { age: 100, restingHr: 160, maxHrMethod: 'tanaka' }, coachToken);
    expect(invalid.status).toBe(400);
    const valid = await call('PUT', path, { maxHrMethod: 'custom', maxHr: 195, restingHr: 60 }, coachToken);
    expect(valid.status).toBe(200);
    const partial = await call('PUT', path, { limitations: 'متن ثبت‌شده' }, coachToken);
    expect(partial.status).toBe(200);
    expect(partial.json.biometrics.maxHr).toBe(195);
    expect(partial.json.biometrics.maxHrMethod).toBe('custom');
  });

});
