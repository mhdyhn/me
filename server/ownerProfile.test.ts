// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { createSession } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { insertUser, type Role } from './users.ts';

let db: Db;
let server: Server;
let base: string;
let clock: Date;
const key = keyFromSecret('owner-profile-copy-test-secret');
type Session = { id: number; token: string };

/** The owner's own numbers; they must never appear inside somebody else's account. */
const ownerProfile = {
  age: 24, sex: 'مرد', heightCm: 190, weightKg: 79.9,
  primaryGoal: 'افزایش تودهٔ عضلانی', secondaryGoal: '', trainingExperience: 'تازه‌کار',
  trainingDays: 5, sessionMinutes: 60, dailyActivity: 'کم‌تحرک، بیشترتر از نشسته', sleepHours: '۴',
  stressLevel: 8, injuries: '', equipment: 'باشگاه کامل',
  workingWeightReferences: [{ label: 'پرس سینه', weightKg: 60, note: 'تخمین' }],
};
const studentProfile = {
  age: 21, sex: 'زن', heightCm: 165, weightKg: 58,
  primaryGoal: 'کاهش وزن', secondaryGoal: '', trainingExperience: 'مبتدی',
  trainingDays: 3, sessionMinutes: 40, dailyActivity: 'پیاده‌روی روزانه', sleepHours: '۷ ساعت',
  stressLevel: 3, injuries: '', equipment: 'خانه',
  workingWeightReferences: [],
};

beforeEach(async () => {
  clock = new Date('2026-10-30T10:00:00.000Z');
  db = await openDatabase('memory');
  server = createServer(createApp({ db, secretKey: key, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);
afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

async function account(username: string, role: Role, coachId: number | null = null): Promise<Session> {
  const id = await insertUser(db, { username, passwordHash: 'unused-in-test', role, displayName: username, coachId, mustChangePassword: false, now: clock });
  const token = (await createSession(db, id, 0, clock))!;
  return { id, token };
}
async function call(method: string, path: string, body?: unknown, session?: Session) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session) headers.Authorization = `Bearer ${session.token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any> };
}
const writeProfile = (session: Session, value: unknown, operationId: string, baseVersion = 0) =>
  call('POST', '/api/me/personal-data/batch', { accountId: session.id, changes: [{ kind: 'profile', key: 'main', baseVersion, deleted: false, value, operationId }] }, session);
const profileRecord = async (session: Session) => {
  const response = await call('GET', `/api/me/personal-data?accountId=${session.id}`, undefined, session);
  return (response.json.records as { kind: string; deleted: boolean; value: unknown }[]).find((item) => item.kind === 'profile') ?? null;
};

describe('the owner profile never stays inside another account', () => {
  it('refuses a copy of the owner profile, keeps the student own profile, and removes a copy that already reached the account', async () => {
    const admin = await account('owner', 'admin');
    const coach = await account('coach-one', 'coach');
    const student = await account('student-one', 'student', coach.id);

    expect((await writeProfile(admin, ownerProfile, 'owner-profile-write')).status).toBe(200);

    // A student may not store the owner's personal data as their own.
    const refused = await writeProfile(student, ownerProfile, 'student-copy-write');
    expect(refused.status).toBe(409);
    expect(refused.json.error).toContain('حساب مالک');
    expect(await profileRecord(student)).toBeNull();

    // The student's own profile is stored normally.
    expect((await writeProfile(student, studentProfile, 'student-own-write')).status).toBe(200);
    expect((await profileRecord(student))?.value).toMatchObject({ weightKg: 58 });

    // A legacy leak: the owner's profile body sits in the student's account.
    await db.query(`UPDATE personal_data_records SET body = $2 WHERE user_id = $1 AND kind = 'profile' AND item_key = 'main'`, [student.id, JSON.stringify(ownerProfile)]);

    const listed = await call('GET', '/api/admin/owner-profile-copies', undefined, admin);
    expect(listed.json.accounts.map((item: { username: string }) => item.username)).toEqual(['student-one']);

    // Only the admin may clean the copies; a coach or a student may not.
    expect((await call('GET', '/api/admin/owner-profile-copies', undefined, coach)).status).toBe(403);
    expect((await call('POST', '/api/admin/owner-profile-copies', {}, student)).status).toBe(403);

    const cleaned = await call('POST', '/api/admin/owner-profile-copies', {}, admin);
    expect(cleaned.json.removed).toHaveLength(1);
    expect(cleaned.json.removed[0]).toMatchObject({ username: 'student-one' });

    // The copy is gone for the student too, and the owner keeps their own profile.
    expect((await profileRecord(student))?.deleted).toBe(true);
    expect((await profileRecord(admin))?.deleted).toBe(false);
    expect((await call('GET', '/api/admin/owner-profile-copies', undefined, admin)).json.accounts).toEqual([]);
  });

  it('lets the account owner delete their own profile and keeps the coach access closed', async () => {
    const admin = await account('owner', 'admin');
    const coach = await account('coach-one', 'coach');
    const student = await account('student-two', 'student', coach.id);

    expect((await writeProfile(student, studentProfile, 'student-own-write')).status).toBe(200);
    const sharingVersion = (await call('GET', `/api/me/profile?accountId=${student.id}`, undefined, student)).json.sharingVersion as number;
    const shared = await call('PUT', '/api/me/profile', { accountId: student.id, profile: studentProfile, shareWithCoach: true, sharingVersion }, student);
    expect(shared.status).toBe(200);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(true);

    // Another account may not clear somebody else's profile.
    expect((await call('POST', '/api/me/profile/purge', { accountId: student.id }, admin)).status).toBe(409);
    expect((await call('POST', '/api/me/profile/purge', { accountId: admin.id }, student)).status).toBe(409);

    const purged = await call('POST', '/api/me/profile/purge', { accountId: student.id }, student);
    expect(purged.status).toBe(200);
    expect(purged.json.cleared).toBe(true);
    expect((await profileRecord(student))?.deleted).toBe(true);
    expect((await call('GET', `/api/students/${student.id}/profile`, undefined, coach)).json.shared).toBe(false);
    expect((await call('GET', `/api/me/profile?accountId=${student.id}`, undefined, student)).json.stored).toBeNull();
  });

  it('leaves a profile that only looks similar alone', async () => {
    const admin = await account('owner', 'admin');
    const student = await account('student-three', 'student');
    expect((await writeProfile(admin, ownerProfile, 'owner-profile-write')).status).toBe(200);
    const similar = { ...ownerProfile, weightKg: 80.1 };
    expect((await writeProfile(student, similar, 'student-similar-write')).status).toBe(200);
    expect((await call('GET', '/api/admin/owner-profile-copies', undefined, admin)).json.accounts).toEqual([]);
  });
});
