// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import type { DatabaseSync } from 'node:sqlite';

type Json = Record<string, any>;

let db: DatabaseSync;
let server: Server;
let base: string;
let clock: Date;

beforeEach(async () => {
  db = openDatabase(':memory:');
  clock = new Date('2026-10-13T08:00:00Z');
  ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
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

/** Admin creates a coach, the coach changes the temporary password, and returns a usable token. */
async function coachSession() {
  const admin = (await login('owner', 'owner-pass-123')).json.token as string;
  const created = await call('POST', '/api/coaches', { displayName: 'مربی یک' }, admin);
  const coachLogin = await login(created.json.username, created.json.password);
  const token = coachLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-new-pass-1' }, token);
  return { token, id: created.json.user.id as number };
}

describe('authentication', () => {
  it('logs the admin in and returns the current user', async () => {
    const res = await login('owner', 'owner-pass-123');
    expect(res.status).toBe(200);
    const me = await call('GET', '/api/me', undefined, res.json.token);
    expect(me.json.user).toMatchObject({ username: 'owner', role: 'admin', mustChangePassword: false });
    expect(JSON.stringify(me.json)).not.toContain('passwordHash');
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const wrong = await login('owner', 'nope-nope-nope');
    const unknown = await login('ghost', 'nope-nope-nope');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.json.error).toBe(unknown.json.error);
  });

  it('locks a username after repeated failures and unlocks after the window', async () => {
    for (let i = 0; i < 5; i += 1) await login('owner', 'wrong-wrong-1');
    const locked = await login('owner', 'owner-pass-123');
    expect(locked.status).toBe(429);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    expect((await login('owner', 'owner-pass-123')).status).toBe(200);
  });

  it('expires sessions after 30 days and revokes them on logout', async () => {
    const token = (await login('owner', 'owner-pass-123')).json.token as string;
    clock = new Date(clock.getTime() + 31 * 24 * 60 * 60 * 1000);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(401);

    const fresh = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('POST', '/api/auth/logout', {}, fresh)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, fresh)).status).toBe(401);
  });

  it('refuses requests without a valid token', async () => {
    expect((await call('GET', '/api/me')).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, 'x'.repeat(30))).status).toBe(401);
  });
});

describe('roles and student provisioning', () => {
  it('only the admin can create coaches', async () => {
    const { token } = await coachSession();
    const res = await call('POST', '/api/coaches', { displayName: 'مربی دو' }, token);
    expect(res.status).toBe(403);
  });

  it('a new coach must change the temporary password before using the app', async () => {
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const created = await call('POST', '/api/coaches', { displayName: 'مربی جدید' }, admin);
    const token = (await login(created.json.username, created.json.password)).json.token as string;
    expect((await call('GET', '/api/students', undefined, token)).status).toBe(403);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(200);
  });

  it('a coach creates a student with a generated username and password', async () => {
    const { token } = await coachSession();
    const res = await call('POST', '/api/students', { displayName: 'شاگرد الف' }, token);
    expect(res.status).toBe(201);
    expect(res.json.username).toMatch(/^s\d{6}$/);
    expect(res.json.password).toMatch(/^[a-z2-9]{10}$/);
    expect(res.json.user).toMatchObject({ role: 'student', mustChangePassword: true });
  });

  it('a student must change the generated password, and then reaches only its own data', async () => {
    const { token } = await coachSession();
    const created = await call('POST', '/api/students', { displayName: 'شاگرد ب' }, token);
    const studentToken = (await login(created.json.username, created.json.password)).json.token as string;

    expect((await call('GET', '/api/students', undefined, studentToken)).status).toBe(403);
    expect((await call('GET', '/api/me', undefined, studentToken)).status).toBe(200);

    const changed = await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'my-own-pass-1' }, studentToken);
    expect(changed.status).toBe(200);
    expect((await call('GET', '/api/me', undefined, studentToken)).json.user.mustChangePassword).toBe(false);
  });

  it('a coach sees only the students it created', async () => {
    const first = await coachSession();
    const second = await coachSession();
    await call('POST', '/api/students', { displayName: 'شاگرد مربی یک' }, first.token);
    const list = await call('GET', '/api/students', undefined, second.token);
    expect(list.json.students).toEqual([]);
  });

  it('a coach cannot reset the password of another coach\'s student', async () => {
    const first = await coachSession();
    const second = await coachSession();
    const student = await call('POST', '/api/students', { displayName: 'شاگرد مربی یک' }, first.token);
    const res = await call('POST', `/api/students/${student.json.user.id}/reset-password`, {}, second.token);
    expect(res.status).toBe(404);
  });

  it('resetting a password issues a new one and signs the student out everywhere', async () => {
    const { token } = await coachSession();
    const created = await call('POST', '/api/students', { displayName: 'شاگرد ج' }, token);
    const studentToken = (await login(created.json.username, created.json.password)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'first-real-pass' }, studentToken);

    const reset = await call('POST', `/api/students/${created.json.user.id}/reset-password`, {}, token);
    expect(reset.status).toBe(200);
    expect(reset.json.password).not.toBe(created.json.password);
    expect((await call('GET', '/api/me', undefined, studentToken)).status).toBe(401);
    expect((await login(created.json.username, created.json.password)).status).toBe(401);
    expect((await login(created.json.username, reset.json.password)).status).toBe(200);
  });

  it('rejects an invalid new password and a wrong current password', async () => {
    const { token } = await coachSession();
    const short = await call('POST', '/api/me/password', { currentPassword: 'coach-new-pass-1', newPassword: 'short' }, token);
    const wrong = await call('POST', '/api/me/password', { currentPassword: 'not-it-at-all', newPassword: 'another-pass-1' }, token);
    expect(short.status).toBe(400);
    expect(wrong.status).toBe(400);
  });
});

describe('admin and coaches', () => {
  it('lists coaches with their student counts', async () => {
    const coach = await coachSession();
    await call('POST', '/api/students', { displayName: 'شاگرد یک' }, coach.token);
    await call('POST', '/api/students', { displayName: 'شاگرد دو' }, coach.token);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const list = await call('GET', '/api/coaches', undefined, admin);
    expect(list.json.coaches).toEqual([expect.objectContaining({ id: coach.id, displayName: 'مربی یک', studentCount: 2 })]);
    expect(JSON.stringify(list.json)).not.toContain('passwordHash');
  });

  it('lets the admin regenerate a coach password, which invalidates the old one and the coach sessions', async () => {
    const coach = await coachSession();
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const reset = await call('POST', `/api/coaches/${coach.id}/reset-password`, {}, admin);
    expect(reset.status).toBe(200);
    expect(reset.json.password).toEqual(expect.any(String));
    expect((await call('GET', '/api/me', undefined, coach.token)).status).toBe(401);
    expect((await login(reset.json.username, 'coach-new-pass-1')).status).toBe(401);
    const fresh = await login(reset.json.username, reset.json.password);
    expect(fresh.json.user.mustChangePassword).toBe(true);
  });

  it('does not expose a coach\'s students or their programmes to the admin', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { displayName: 'شاگرد یک' }, coach.token);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('GET', `/api/coaches/${coach.id}/students`, undefined, admin)).status).toBe(404);
    expect((await call('GET', `/api/coaches/${coach.id}/students/${created.json.user.id}/program`, undefined, admin)).status).toBe(404);
    expect(JSON.stringify((await call('GET', '/api/coaches', undefined, admin)).json)).not.toContain('شاگرد یک');
  });

  it('refuses the coach list and the admin routes to anyone else, and hides ids that are not coaches', async () => {
    const coach = await coachSession();
    expect((await call('GET', '/api/coaches', undefined, coach.token)).status).toBe(403);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('POST', `/api/coaches/${coach.id + 99}/reset-password`, {}, admin)).status).toBe(404);
  });
});
