// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

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

/** Admin creates a coach, the coach changes the temporary password, and returns a usable token. */
async function coachSession() {
  const admin = (await login('owner', 'owner-pass-123')).json.token as string;
  const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی یک' }, admin);
  const coachLogin = await login(created.json.username, created.json.password);
  const token = coachLogin.json.token as string;
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-new-pass-1' }, token);
  return { token, id: created.json.user.id as number, username: created.json.username as string };
}

describe('student profile sharing', () => {
  async function createStudentAccount(coachToken: string) {
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد پروفایل' }, coachToken);
    const loginResult = await login(created.json.username, created.json.password);
    const token = loginResult.json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-1' }, token);
    return { id: created.json.user.id as number, token };
  }

  const profile = {
    age: 28, sex: 'زن', heightCm: 168, weightKg: 64, primaryGoal: 'بهبود آمادگی', secondaryGoal: '',
    trainingExperience: 'تازه‌کار', trainingDays: 3, sessionMinutes: 45, dailyActivity: 'فعالیت سبک',
    sleepHours: '۷ ساعت', stressLevel: 0, injuries: 'بدون محدودیت', equipment: 'باشگاه کامل', workingWeightReferences: [],
  };

  it('uses the versioned profile for consented sharing and never revives a deleted one', async () => {
    const owner = await coachSession();
    const student = await createStudentAccount(owner.token);
    await call('PUT', '/api/me/profile', { profile, shareWithCoach: true }, student.token);
    const versioned = { ...profile, age: 31 };
    const change = (version: number, deleted: boolean, value: unknown, operationId: string) => ({ kind: 'profile', key: 'main', baseVersion: version, deleted, value, operationId });
    const write = (item: unknown) => call('POST', '/api/me/personal-data/batch', { accountId: student.id, changes: [item] }, student.token);
    expect((await write(change(0, false, versioned, 'profile-write-01'))).json.results[0].status).toBe('saved');
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json.profile.age).toBe(31);
    await call('PUT', '/api/me/profile', { profile, shareWithCoach: true }, student.token);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json.profile.age).toBe(31);
    expect((await write(change(1, true, null, 'profile-delete-02'))).json.results[0].status).toBe('saved');
    expect((await call('GET', '/api/me/profile', undefined, student.token)).json.stored).toBeNull();
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json).toMatchObject({ shared: false, profile: null });
    expect((await write(change(2, false, { ...profile, age: 32 }, 'profile-write-03'))).json.results[0].status).toBe('saved');
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json).toMatchObject({ shared: false, profile: null });
    expect((await call('POST', '/api/me/profile/sharing', { shareWithCoach: true }, student.token)).json.shareWithCoach).toBe(true);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json.profile.age).toBe(32);
  });

  it('refuses profile or sharing requests made with another account after a tab switch', async () => {
    const owner = await coachSession();
    const first = await createStudentAccount(owner.token);
    const second = await createStudentAccount(owner.token);
    expect((await call('GET', `/api/me/profile?accountId=${first.id}`, undefined, second.token)).status).toBe(409);
    expect((await call('PUT', '/api/me/profile', { accountId: first.id, profile, shareWithCoach: true }, second.token)).status).toBe(409);
    expect((await call('POST', '/api/me/profile/sharing', { accountId: first.id, shareWithCoach: true }, second.token)).status).toBe(409);
    expect((await call('GET', '/api/me/profile', undefined, second.token)).json.stored).toBeNull();
  });

  it('syncs only with explicit consent and limits the profile to the owning coach', async () => {
    const owner = await coachSession();
    const other = await coachSession();
    const student = await createStudentAccount(owner.token);

    expect((await call('GET', '/api/me/profile', undefined, student.token)).json.stored).toBeNull();
    const privateSave = await call('PUT', '/api/me/profile', { profile, shareWithCoach: false }, student.token);
    expect(privateSave.status).toBe(200);
    const privateView = await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token);
    expect(privateView.json).toMatchObject({ shared: false, profile: null });

    const sharedSave = await call('PUT', '/api/me/profile', { profile, shareWithCoach: true }, student.token);
    expect(sharedSave.json.stored).toMatchObject({ shareWithCoach: true, profile });
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json.profile).toEqual(profile);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, other.token)).status).toBe(404);

    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, admin)).status).toBe(403);
    expect((await call('GET', '/api/me/profile', undefined, owner.token)).status).toBe(403);

    const revoked = await call('POST', '/api/me/profile/sharing', { shareWithCoach: false }, student.token);
    expect(revoked.json.shareWithCoach).toBe(false);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, owner.token)).json.profile).toBeNull();
  });
});

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

  it('forgets incomplete failed attempts after the lock window', async () => {
    for (let i = 0; i < 4; i += 1) expect((await login('owner', 'wrong-wrong-1')).status).toBe(401);
    clock = new Date(clock.getTime() + 16 * 60 * 1000);
    expect((await login('owner', 'wrong-wrong-1')).status).toBe(401);
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
    const res = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی دو' }, token);
    expect(res.status).toBe(403);
  });

  it('a new coach must change the temporary password before using the app', async () => {
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی جدید' }, admin);
    const token = (await login(created.json.username, created.json.password)).json.token as string;
    expect((await call('GET', '/api/students', undefined, token)).status).toBe(403);
    expect((await call('GET', '/api/me', undefined, token)).status).toBe(200);
  });

  it('a coach creates a student with a generated username and password', async () => {
    const { token } = await coachSession();
    const res = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد الف' }, token);
    expect(res.status).toBe(201);
    expect(res.json.username).toMatch(/^s\d{6}$/);
    expect(res.json.password).toMatch(/^[a-z2-9]{10}$/);
    expect(res.json.user).toMatchObject({ role: 'student', mustChangePassword: true });
  });

  it('a student must change the generated password, and then reaches only its own data', async () => {
    const { token } = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد ب' }, token);
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
    await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد مربی یک' }, first.token);
    const list = await call('GET', '/api/students', undefined, second.token);
    expect(list.json.students).toEqual([]);
  });

  it('a coach cannot reset the password of another coach\'s student', async () => {
    const first = await coachSession();
    const second = await coachSession();
    const student = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد مربی یک' }, first.token);
    const res = await call('POST', `/api/students/${student.json.user.id}/reset-password`, {}, second.token);
    expect(res.status).toBe(404);
  });

  it('resetting a password issues a new one and signs the student out everywhere', async () => {
    const { token } = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد ج' }, token);
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

  it('keeps the current session but revokes other sessions on password changes for all three roles', async () => {
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const adminOther = (await login('owner', 'owner-pass-123')).json.token as string;
    const createdCoach = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی امنیت' }, admin);
    const coach = (await login(createdCoach.json.username, createdCoach.json.password)).json.token as string;
    const coachOther = (await login(createdCoach.json.username, createdCoach.json.password)).json.token as string;
    expect((await call('POST', '/api/me/password', { currentPassword: createdCoach.json.password, newPassword: 'coach-private-pass' }, coach)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, coach)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, coachOther)).status).toBe(401);

    const createdStudent = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد امنیت' }, coach);
    const student = (await login(createdStudent.json.username, createdStudent.json.password)).json.token as string;
    const studentOther = (await login(createdStudent.json.username, createdStudent.json.password)).json.token as string;
    expect((await call('POST', '/api/me/password', { currentPassword: 'wrong-password', newPassword: 'student-private-pass' }, student)).status).toBe(400);
    expect((await call('GET', '/api/me', undefined, studentOther)).status).toBe(200);
    expect((await call('POST', '/api/me/password', { currentPassword: createdStudent.json.password, newPassword: 'student-private-pass' }, student)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, student)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, studentOther)).status).toBe(401);

    expect((await call('POST', '/api/me/password', { currentPassword: 'owner-pass-123', newPassword: 'owner-private-pass' }, admin)).status).toBe(200);
    const currentAdmin = await call('GET', '/api/me', undefined, admin);
    expect(currentAdmin.status).toBe(200);
    expect(currentAdmin.json.user).not.toHaveProperty('authVersion');
    expect((await call('GET', '/api/me', undefined, adminOther)).status).toBe(401);
    expect((await call('GET', '/api/me', undefined, coach)).status).toBe(200);
    expect((await call('GET', '/api/me', undefined, student)).status).toBe(200);
    expect((await login('owner', 'owner-private-pass')).status).toBe(200);
  });
});

describe('admin and coaches', () => {
  it('lists coaches with their student counts', async () => {
    const coach = await coachSession();
    await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد یک' }, coach.token);
    await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد دو' }, coach.token);
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
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد یک' }, coach.token);
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

describe('deleting coaches and students', () => {
  it('lets a coach delete one of their students, and the student can no longer sign in', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد حذفی' }, coach.token);
    const studentId = created.json.user.id as number;
    const student = await login(created.json.username as string, created.json.password as string);
    expect(student.status).toBe(200);
    const removed = await call('DELETE', `/api/students/${studentId}`, {}, coach.token);
    expect(removed.status).toBe(200);
    const list = await call('GET', '/api/students', undefined, coach.token);
    expect(list.json.students).toEqual([]);
    expect((await call('GET', '/api/me', undefined, student.json.token)).status).toBe(401);
    expect((await login(created.json.username as string, created.json.password as string)).status).toBe(401);
  });

  it('does not let a coach delete another coach\'s student', async () => {
    const coach = await coachSession();
    const other = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد مال مربی یک' }, coach.token);
    const removed = await call('DELETE', `/api/students/${created.json.user.id}`, {}, other.token);
    expect(removed.status).toBe(404);
  });

  it('refuses to delete a coach who still has students, and deletes the coach once none are left', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد باقی‌مانده' }, coach.token);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;

    const blocked = await call('DELETE', `/api/coaches/${coach.id}`, {}, admin);
    expect(blocked.status).toBe(409);
    expect((await call('GET', '/api/coaches', undefined, admin)).json.coaches).toEqual([
      expect.objectContaining({ id: coach.id, studentCount: 1 }),
    ]);

    await call('DELETE', `/api/students/${created.json.user.id}`, {}, coach.token);
    const removed = await call('DELETE', `/api/coaches/${coach.id}`, {}, admin);
    expect(removed.status).toBe(200);
    expect((await call('GET', '/api/coaches', undefined, admin)).json.coaches).not.toContainEqual(expect.objectContaining({ id: coach.id }));
    expect((await login(coach.username, 'coach-new-pass-1')).status).toBe(401);
  });

  it('only lets the admin delete coaches, and never a student or the admin', async () => {
    const coach = await coachSession();
    const student = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد' }, coach.token);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('DELETE', `/api/coaches/${coach.id}`, {}, coach.token)).status).toBe(403);
    expect((await call('DELETE', `/api/coaches/${student.json.user.id}`, {}, admin)).status).toBe(404);
    expect((await call('DELETE', `/api/students/${student.json.user.id}`, {}, admin)).status).toBe(403);
  });
});

describe('text chat between a coach and a student', () => {
  /** A student who has already changed the temporary password, so the app is open to them. */
  async function studentSession(coachToken: string, displayName: string) {
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName }, coachToken);
    const token = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-1' }, token);
    return { token, id: created.json.user.id as number };
  }

  it('lets the coach and the student exchange messages in one thread', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد چت');
    expect((await call('POST', '/api/me/chat', { body: 'سلام مربی' }, student.token)).status).toBe(201);
    expect((await call('POST', `/api/students/${student.id}/chat`, { body: 'سلام، برنامه آماده است' }, coach.token)).status).toBe(201);

    const forStudent = await call('GET', '/api/me/chat', undefined, student.token);
    expect(forStudent.json.messages.map((m: { body: string }) => m.body)).toEqual(['سلام مربی', 'سلام، برنامه آماده است']);
    expect(forStudent.json.messages[0].senderId).toBe(student.id);
    const forCoach = await call('GET', `/api/students/${student.id}/chat`, undefined, coach.token);
    expect(forCoach.json.studentName).toBe('شاگرد چت');
    expect(forCoach.json.messages).toHaveLength(2);
  });

  it('keeps each student\'s thread private, and keeps the admin out', async () => {
    const coach = await coachSession();
    const first = await studentSession(coach.token, 'شاگرد اول');
    const second = await studentSession(coach.token, 'شاگرد دوم');
    await call('POST', '/api/me/chat', { body: 'راز شاگرد اول' }, first.token);

    expect((await call('GET', '/api/me/chat', undefined, second.token)).json.messages).toEqual([]);
    expect((await call('GET', `/api/students/${second.id}/chat`, undefined, coach.token)).json.messages).toEqual([]);
    expect((await call('GET', `/api/students/${first.id}/chat`, undefined, (await coachSession()).token)).status).toBe(404);

    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('GET', `/api/students/${first.id}/chat`, undefined, admin)).status).toBe(403);
    expect((await call('GET', '/api/me/chat', undefined, admin)).status).toBe(403);
  });

  it('rejects empty and oversized messages', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد پیام');
    expect((await call('POST', '/api/me/chat', { body: '   ' }, student.token)).status).toBe(400);
    expect((await call('POST', '/api/me/chat', { body: 'a'.repeat(1001) }, student.token)).status).toBe(400);
    expect((await call('POST', '/api/me/chat', { body: 'a'.repeat(1000) }, student.token)).status).toBe(201);
  });

  it('supports voice and image media messages in chat', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد مدیا');
    const voiceMsg = await call('POST', '/api/me/chat', { mediaType: 'voice', mediaData: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ8USA==' }, student.token);
    expect(voiceMsg.status).toBe(201);
    expect(voiceMsg.json.message.mediaType).toBe('voice');

    const imageMsg = await call('POST', `/api/students/${student.id}/chat`, { body: 'تصویر فرم', mediaType: 'image', mediaData: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }, coach.token);
    expect(imageMsg.status).toBe(201);
    expect(imageMsg.json.message.mediaType).toBe('image');
    expect(imageMsg.json.message.body).toBe('تصویر فرم');

    const list = await call('GET', '/api/me/chat', undefined, student.token);
    expect(list.json.messages).toHaveLength(2);
    expect(list.json.messages[0].mediaType).toBe('voice');
    expect(list.json.messages[1].mediaType).toBe('image');
  });

  it('supports direct chat between admin and coach', async () => {
    const coach = await coachSession();
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;

    const fromCoach = await call('POST', '/api/coach/chat', { body: 'سلام مدیریت محترم' }, coach.token);
    expect(fromCoach.status).toBe(201);

    const fromAdmin = await call('POST', `/api/coaches/${coach.id}/chat`, { body: 'سلام، مشکلی در سالن هست؟' }, admin);
    expect(fromAdmin.status).toBe(201);

    const coachView = await call('GET', '/api/coach/chat', undefined, coach.token);
    expect(coachView.status).toBe(200);
    expect(coachView.json.adminName).toBe('مدیر باشگاه');
    expect(coachView.json.messages.map((m: { body: string }) => m.body)).toEqual(['سلام مدیریت محترم', 'سلام، مشکلی در سالن هست؟']);

    const adminView = await call('GET', `/api/coaches/${coach.id}/chat`, undefined, admin);
    expect(adminView.status).toBe(200);
    expect(adminView.json.coachName).toBe('مربی یک');
    expect(adminView.json.messages).toHaveLength(2);
  });

  it('removes a student\'s messages when the student is deleted', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد حذفی چت');
    await call('POST', `/api/students/${student.id}/chat`, { body: 'پیام' }, coach.token);
    expect((await call('DELETE', `/api/students/${student.id}`, {}, coach.token)).status).toBe(200);
    const count = (await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM messages WHERE student_id = $1', [student.id]))[0]!;
    expect(Number(count.n)).toBe(0);
  });
});

describe('generated passwords on the cards', () => {
  it('shows the admin a coach\'s generated password until the coach chooses their own', async () => {
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const created = await call('POST', '/api/coaches', { phoneNumber: '09121234567', displayName: 'مربی رمز' }, admin);
    const before = (await call('GET', '/api/coaches', undefined, admin)).json.coaches.find((c: { id: number }) => c.id === created.json.user.id);
    expect(before.password).toBe(created.json.password);

    const token = (await login(created.json.username, created.json.password)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'my-own-pass-42' }, token);
    const after = (await call('GET', '/api/coaches', undefined, admin)).json.coaches.find((c: { id: number }) => c.id === created.json.user.id);
    expect(after.password).toBeNull();
  });

  it('shows a coach their students\' generated passwords, and a reset replaces them', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد رمز' }, coach.token);
    const listed = await call('GET', '/api/students', undefined, coach.token);
    expect(listed.json.students[0].password).toBe(created.json.password);
    const reset = await call('POST', `/api/students/${created.json.user.id}/reset-password`, {}, coach.token);
    const relisted = await call('GET', '/api/students', undefined, coach.token);
    expect(relisted.json.students[0].password).toBe(reset.json.password);
    expect(reset.json.password).not.toBe(created.json.password);
  });

  it('stores generated passwords only as a hash and an encrypted copy', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد مخفی' }, coach.token);
    const raw = (await db.query<{ password_hash: string; password_enc: string }>('SELECT password_hash, password_enc FROM users WHERE id = $1', [created.json.user.id]))[0]!;
    expect(raw.password_hash).not.toContain(created.json.password);
    expect(raw.password_enc).not.toContain(created.json.password);
  });
});

describe('nutrition plans', () => {
  function emptyWeek() {
    return ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name) => ({ name, meals: [] as { name: string; items: { foodId: string; grams: number }[] }[] }));
  }

  it('lets the coach save a weekly plan, and the student read it back', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد تغذیه' }, coach.token);
    const studentToken = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-2' }, studentToken);

    const days = emptyWeek();
    days[0]!.meals = [{ name: 'صبحانه', items: [{ foodId: 'egg-whole', grams: 100 }, { foodId: 'bread-white', grams: 60.04 }] }];
    const saved = await call('PUT', `/api/students/${created.json.user.id}/nutrition`, { targets: { kcal: 2400, proteinG: 160 }, days }, coach.token);
    expect(saved.status).toBe(200);
    expect(saved.json.plan.days[0].name).toBe('شنبه');
    expect(saved.json.plan.days[0].meals[0].items[1].grams).toBe(60);
    expect(saved.json.plan.targets).toEqual({ kcal: 2400, proteinG: 160, carbsG: null, fatG: null });

    const forStudent = await call('GET', '/api/me/nutrition', undefined, studentToken);
    expect(forStudent.json.coachName).toBe('مربی یک');
    expect(forStudent.json.plan.days[0].meals[0].name).toBe('صبحانه');
  });

  it('gives the student no plan until the coach makes one, and the coach an empty week', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد خالی' }, coach.token);
    const studentToken = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-new-pass-3' }, studentToken);
    expect((await call('GET', '/api/me/nutrition', undefined, studentToken)).json.plan).toBeNull();
    const coachView = await call('GET', `/api/students/${created.json.user.id}/nutrition`, undefined, coach.token);
    expect(coachView.json.plan.days).toHaveLength(7);
    expect(coachView.json.plan.days.every((day: { meals: unknown[] }) => day.meals.length === 0)).toBe(true);
  });

  it('rejects plans the app cannot calculate or display safely', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد نامعتبر' }, coach.token);
    const url = `/api/students/${created.json.user.id}/nutrition`;
    const withMeal = (items: unknown[], name = 'ناهار') => {
      const days = emptyWeek();
      days[1]!.meals = [{ name, items: items as { foodId: string; grams: number }[] }];
      return { days };
    };
    expect((await call('PUT', url, { days: emptyWeek().slice(0, 6) }, coach.token)).status).toBe(400);
    expect((await call('PUT', url, withMeal([{ foodId: 'no-such-food', grams: 100 }]), coach.token)).status).toBe(400);
    expect((await call('PUT', url, withMeal([{ foodId: 'banana', grams: 0 }]), coach.token)).status).toBe(400);
    expect((await call('PUT', url, withMeal([{ foodId: 'banana', grams: 2001 }]), coach.token)).status).toBe(400);
    expect((await call('PUT', url, withMeal([{ foodId: 'banana', grams: 'ده' }]), coach.token)).status).toBe(400);
    expect((await call('PUT', url, withMeal([], '   '), coach.token)).status).toBe(400);
    expect((await call('PUT', url, { targets: { kcal: -5 }, days: emptyWeek() }, coach.token)).status).toBe(400);
    expect((await call('PUT', url, { targets: { proteinG: 'زیاد' }, days: emptyWeek() }, coach.token)).status).toBe(400);
  });

  it('keeps each student\'s plan to their own coach and keeps the admin out', async () => {
    const coach = await coachSession();
    const other = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد خصوصی تغذیه' }, coach.token);
    const url = `/api/students/${created.json.user.id}/nutrition`;
    expect((await call('GET', url, undefined, other.token)).status).toBe(404);
    expect((await call('PUT', url, { days: emptyWeek() }, other.token)).status).toBe(404);
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    expect((await call('GET', url, undefined, admin)).status).toBe(403);
    expect((await call('GET', '/api/me/nutrition', undefined, admin)).status).toBe(403);
  });

  it('removes the plan when the student is deleted', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد حذف تغذیه' }, coach.token);
    await call('PUT', `/api/students/${created.json.user.id}/nutrition`, { days: emptyWeek() }, coach.token);
    await call('DELETE', `/api/students/${created.json.user.id}`, {}, coach.token);
    const count = (await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM nutrition_plans WHERE student_id = $1', [created.json.user.id]))[0]!;
    expect(Number(count.n)).toBe(0);
  });
});

describe('personal meal diary', () => {
  const meal = (name: string, items: { foodId: string; grams: number }[]) => ({ name, items });

  it('lets anyone signed in keep their own day, and nobody else sees it', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد دفتر' }, coach.token);
    const studentToken = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-diary-pass-1' }, studentToken);

    const coachSave = await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [meal('ناهار', [{ foodId: 'chicken-breast', grams: 200 }])] }, coach.token);
    expect(coachSave.status).toBe(200);
    expect(coachSave.json.diary.meals[0].items[0].grams).toBe(200);

    const studentSave = await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [meal('صبحانه', [{ foodId: 'egg-whole', grams: 50 }])] }, studentToken);
    expect(studentSave.status).toBe(200);

    const coachRead = await call('GET', '/api/me/diary/2026-10-13', undefined, coach.token);
    expect(coachRead.json.diary.meals.map((m: { name: string }) => m.name)).toEqual(['ناهار']);
    const studentRead = await call('GET', '/api/me/diary/2026-10-13', undefined, studentToken);
    expect(studentRead.json.diary.meals.map((m: { name: string }) => m.name)).toEqual(['صبحانه']);
    expect((await call('GET', '/api/me/diary/2026-10-14', undefined, studentToken)).json.diary).toEqual({ day: '2026-10-14', meals: [], updatedAt: null });
  });

  it('checks the date and the foods the same way as the plan', async () => {
    const coach = await coachSession();
    for (const day of ['2026-02-30', '13-10-2026', 'امروز']) {
      expect((await call('PUT', '/api/me/diary', { day, meals: [] }, coach.token)).status).toBe(400);
      expect((await call('GET', `/api/me/diary/${encodeURIComponent(day)}`, undefined, coach.token)).status).toBe(400);
    }
    expect((await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [meal('x', [{ foodId: 'not-a-food', grams: 10 }])] }, coach.token)).status).toBe(400);
    expect((await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [meal('x', [{ foodId: 'egg-whole', grams: 2001 }])] }, coach.token)).status).toBe(400);
    expect((await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: Array.from({ length: 9 }, (_, i) => meal(`w${i}`, [])) }, coach.token)).status).toBe(400);
  });

  it('needs a signed-in user', async () => {
    expect((await call('GET', '/api/me/diary/2026-10-13')).status).toBe(401);
    expect((await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [] })).status).toBe(401);
  });

  it('allows a coach to view their student diary but protects other students and has security headers', async () => {
    const coach = await coachSession();
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName: 'شاگرد دفتر ۲' }, coach.token);
    const studentToken = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-diary-pass-2' }, studentToken);

    await call('PUT', '/api/me/diary', { day: '2026-10-13', meals: [meal('صبحانه', [{ foodId: 'egg-whole', grams: 100 }])] }, studentToken);

    const coachView = await call('GET', `/api/students/${created.json.user.id}/diary/2026-10-13`, undefined, coach.token);
    expect(coachView.status).toBe(200);
    expect(coachView.headers.get('x-content-type-options')).toBe('nosniff');
    expect(coachView.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(coachView.json.studentName).toBe('شاگرد دفتر ۲');
    expect(coachView.json.diary.meals[0].name).toBe('صبحانه');

    const otherCoach = await coachSession();
    const forbidden = await call('GET', `/api/students/${created.json.user.id}/diary/2026-10-13`, undefined, otherCoach.token);
    expect(forbidden.status).toBe(404);
  });
});

describe('ZarinPal payments with multi-settlement', () => {
  async function studentSession(coachToken: string, displayName: string) {
    const created = await call('POST', '/api/students', { phoneNumber: '09121234567', displayName }, coachToken);
    const token = (await login(created.json.username as string, created.json.password as string)).json.token as string;
    await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'student-pay-pass-1' }, token);
    return { token, id: created.json.user.id as number };
  }

  it('filters invalid and sandbox references in actual production entitlement queries', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد تست قدیمی');
    await db.query(`INSERT INTO payment_transactions
      (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, gateway_mode, programme_id)
      VALUES ($1, $2, 100, 90, 10, 'legacy-test', 'paid', NULL, $3, 'legacy', 'legacy-test-program')`, [student.id, coach.id, clock.toISOString()]);
    const { isProgramPaid } = await import('./payments.ts');
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(await isProgramPaid(db, student.id, 'legacy-test-program')).toBe(false);
      await db.query("UPDATE payment_transactions SET ref_id = 'undefined' WHERE authority = 'legacy-test'");
      expect(await isProgramPaid(db, student.id, 'legacy-test-program')).toBe(false);
      await db.query("UPDATE payment_transactions SET ref_id = 'SANDBOX-123' WHERE authority = 'legacy-test'");
      expect(await isProgramPaid(db, student.id, 'legacy-test-program')).toBe(false);
      await db.query("UPDATE payment_transactions SET ref_id = '123456' WHERE authority = 'legacy-test'");
      expect(await isProgramPaid(db, student.id, 'legacy-test-program')).toBe(true);
      await db.query("UPDATE payment_transactions SET gateway_mode = 'sandbox' WHERE authority = 'legacy-test'");
      expect(await isProgramPaid(db, student.id, 'legacy-test-program')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('calculates 90/10 commission split accurately with odd and edge amounts', async () => {
    const { calculateCommission } = await import('./payments.ts');

    const testAmounts = [100000, 99999, 1, 33333, 777777, 50000, 0];
    for (const amount of testAmounts) {
      const { coachShare, adminShare } = calculateCommission(amount);
      expect(coachShare + adminShare).toBe(amount);
      expect(coachShare).toBe(Math.floor((amount * 90) / 100));
      expect(adminShare).toBe(amount - coachShare);
    }
  });

  it('validates and stores coach IBAN (Sheba)', async () => {
    const coach = await coachSession();

    // Invalid IBANs
    expect((await call('PUT', '/api/coach/iban', { iban: '1234' }, coach.token)).status).toBe(400);
    expect((await call('PUT', '/api/coach/iban', { iban: 'DE120000000000000000000000' }, coach.token)).status).toBe(400);

    // Valid IBAN
    const validIban = 'IR120000000000000000000001';
    const putRes = await call('PUT', '/api/coach/iban', { iban: 'ir 1200 0000 0000 0000 0000 0001' }, coach.token);
    expect(putRes.status).toBe(200);
    expect(putRes.json.iban).toBe(validIban);

    const getRes = await call('GET', '/api/coach/iban', undefined, coach.token);
    expect(getRes.status).toBe(200);
    expect(getRes.json.iban).toBe(validIban);
  });

  it('handles full purchase flow: start, verify, unlock program, and prevents duplicate callback', async () => {
    const coach = await coachSession();
    await call('PUT', '/api/coach/iban', { iban: 'IR980000000000000000000001' }, coach.token);

    const student = await studentSession(coach.token, 'شاگرد پرداختی');

    // Coach assigns paid program
    const saveRes = await call(
      'PUT',
      `/api/students/${student.id}/program`,
      {
        title: 'برنامه تخصصی هایپرتروفی',
        priceTomans: 200000,
        days: [
          {
            name: 'روز سینه و جلو بازو',
            exercises: [
              { exerciseId: 'bench-press', name: 'پرس سینه هالتر', muscle: 'سینه', sets: 4, reps: '8-10', restSeconds: 90 },
            ],
          },
        ],
      },
      coach.token
    );
    expect(saveRes.status).toBe(200);
    expect(saveRes.json.program.priceTomans).toBe(200000);

    // Student visits program: exercises are locked
    const lockedView = await call('GET', '/api/me/program', undefined, student.token);
    expect(lockedView.status).toBe(200);
    expect(lockedView.json.isPaid).toBe(false);
    expect(lockedView.json.program.title).toBe('برنامه تخصصی هایپرتروفی');
    expect(lockedView.json.program.days).toHaveLength(0); // Exercises masked on server

    // Student initiates payment
    const current = (await call('GET', '/api/me/program', undefined, student.token)).json.program;
    const startRes = await call('POST', '/api/pay/start', { expectedId: current.id, expectedVersion: current.version }, student.token);
    expect(startRes.status).toBe(201);
    expect(startRes.json.authority).toBeDefined();
    expect(startRes.json.paymentUrl).toBeDefined();
    const authority = startRes.json.authority as string;

    // Another coach must not read or cancel this student's transaction by guessing its authority.
    const otherCoach = await coachSession();
    expect((await call('GET', `/api/pay/transaction/${authority}`, undefined, otherCoach.token)).status).toBe(404);
    expect((await call('POST', '/api/pay/verify', { authority, status: 'NOK' }, otherCoach.token)).status).toBe(404);

    // Verify payment successfully
    const verifyRes = await call('POST', '/api/pay/verify', { authority, status: 'OK' }, student.token);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.json.success).toBe(true);
    expect(verifyRes.json.transaction.status).toBe('paid');
    expect(verifyRes.json.transaction.refId).toBeDefined();
    expect(verifyRes.json.transaction.coachShareTomans).toBe(180000); // 90%
    expect(verifyRes.json.transaction.adminShareTomans).toBe(20000);  // 10%

    // Duplicate callback / verify test (Idempotent)
    const duplicateVerify = await call('POST', '/api/pay/verify', { authority, status: 'OK' }, student.token);
    expect(duplicateVerify.status).toBe(200);
    expect(duplicateVerify.json.success).toBe(true);
    expect(duplicateVerify.json.transaction.status).toBe('paid');

    // Student visits program now: completely unlocked
    const unlockedView = await call('GET', '/api/me/program', undefined, student.token);
    expect(unlockedView.status).toBe(200);
    expect(unlockedView.json.isPaid).toBe(true);
    expect(unlockedView.json.program.days).toHaveLength(1);
    expect(unlockedView.json.program.days[0].exercises[0].exerciseId).toBe('bench-press');

    // Trying to start payment again for already paid program returns 400
    const secondStart = await call('POST', '/api/pay/start', { expectedId: current.id, expectedVersion: current.version }, student.token);
    expect(secondStart.status).toBe(400);

    // Coach views transactions
    const coachTransactions = await call('GET', '/api/coach/transactions', undefined, coach.token);
    expect(coachTransactions.status).toBe(200);
    expect(coachTransactions.json.transactions.length).toBeGreaterThanOrEqual(1);
    expect(coachTransactions.json.transactions[0].authority).toBe(authority);
    expect(coachTransactions.json.transactions[0].coachShareTomans).toBe(180000);

    // Other coach does not see it
    const otherCoachTransactions = await call('GET', '/api/coach/transactions', undefined, otherCoach.token);
    expect(otherCoachTransactions.json.transactions).toHaveLength(0);

    // Admin views all transactions
    const admin = (await login('owner', 'owner-pass-123')).json.token as string;
    const adminTransactions = await call('GET', '/api/admin/transactions', undefined, admin);
    expect(adminTransactions.status).toBe(200);
    expect(adminTransactions.json.transactions.some((t: { authority: string }) => t.authority === authority)).toBe(true);
  });

  it('handles actual callback routes in an isolated sandbox for success, repeats and cancellation', async () => {
    const coach = await coachSession();
    const paidStudent = await studentSession(coach.token, 'شاگرد بازگشت موفق');
    const cancelStudent = await studentSession(coach.token, 'شاگرد بازگشت ناموفق');
    const program = {
      title: 'برنامهٔ آزمایش بازگشت', priceTomans: 100000,
      days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }],
    };
    const startFor = async (student: { id: number; token: string }) => {
      const saved = await call('PUT', `/api/students/${student.id}/program`, program, coach.token);
      const offer = saved.json.program;
      const checkout = await call('POST', '/api/pay/start', { expectedId: offer.id, expectedVersion: offer.version }, student.token);
      expect(checkout.status).toBe(201);
      expect(checkout.json.authority).toMatch(/^SANDBOX-/);
      return checkout.json.authority as string;
    };
    const successAuthority = await startFor(paidStudent);
    const callback = (authority: string, status: string) => fetch(`${base}/api/pay/callback?Authority=${encodeURIComponent(authority)}&Status=${status}`, { redirect: 'manual' });
    const success = await callback(successAuthority, 'OK');
    expect(success.status).toBe(302);
    expect(success.headers.get('location')).toContain('status=paid');
    expect((await callback(successAuthority, 'OK')).status).toBe(302);
    const unlocked = await call('GET', '/api/me/program', undefined, paidStudent.token);
    expect(unlocked.json.isPaid).toBe(true);
    expect(unlocked.json.program.days).toHaveLength(1);

    const cancelAuthority = await startFor(cancelStudent);
    const canceled = await callback(cancelAuthority, 'NOK');
    expect(canceled.status).toBe(302);
    expect(canceled.headers.get('location')).toContain('status=failed');
    expect((await call('GET', '/api/me/program', undefined, cancelStudent.token)).json.isPaid).toBe(false);
    const transactions = (await call('GET', '/api/coach/transactions', undefined, coach.token)).json.transactions;
    expect(transactions).toHaveLength(2);
    expect(transactions.find((row: { authority: string }) => row.authority === successAuthority).status).toBe('paid');
    expect(transactions.find((row: { authority: string }) => row.authority === cancelAuthority).status).toBe('canceled');
  });

  it('marks transaction as canceled when gateway returns NOK', async () => {
    const coach = await coachSession();
    const student = await studentSession(coach.token, 'شاگرد انصرافی');

    await call(
      'PUT',
      `/api/students/${student.id}/program`,
      {
        title: 'برنامه انصرافی',
        priceTomans: 50000,
        days: [{ name: 'روز ۱', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }],
      },
      coach.token
    );

    const current = (await call('GET', '/api/me/program', undefined, student.token)).json.program;
    const startRes = await call('POST', '/api/pay/start', { expectedId: current.id, expectedVersion: current.version }, student.token);
    const authority = startRes.json.authority as string;

    const cancelRes = await call('POST', '/api/pay/verify', { authority, status: 'NOK' }, student.token);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.json.success).toBe(false);
    expect(cancelRes.json.transaction.status).toBe('canceled');

    // Program remains locked
    const view = await call('GET', '/api/me/program', undefined, student.token);
    expect(view.json.isPaid).toBe(false);
    expect(view.json.program.days).toHaveLength(0);
  });
});
