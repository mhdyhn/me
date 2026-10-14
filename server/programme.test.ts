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
const clock = new Date('2026-10-13T08:00:00Z');

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

async function signIn(username: string, password: string): Promise<string> {
  return (await call('POST', '/api/auth/login', { username, password })).json.token as string;
}

/** Admin creates a coach; the coach changes the temporary password and gets a usable session. */
async function coach(): Promise<string> {
  const admin = await signIn('owner', 'owner-pass-123');
  const created = await call('POST', '/api/coaches', { displayName: 'مربی یک' }, admin);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'coach-new-pass-1' }, token);
  return token;
}

/** Coach creates a student and the student changes the generated password. */
async function student(coachToken: string): Promise<{ id: number; token: string }> {
  const created = await call('POST', '/api/students', { displayName: 'شاگرد برنامه' }, coachToken);
  const token = await signIn(created.json.username, created.json.password);
  await call('POST', '/api/me/password', { currentPassword: created.json.password, newPassword: 'programme-pass-1' }, token);
  return { id: created.json.user.id as number, token };
}

const goodProgramme = {
  title: 'برنامهٔ سه روزه',
  days: [
    {
      name: 'روز اول',
      exercises: [{ exerciseId: 'flat-dumbbell-press', name: 'پرس سینه دمبل', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }],
    },
  ],
};

describe('student programme', () => {
  it('a coach saves a programme and the student reads it', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const saved = await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken);
    expect(saved.status).toBe(200);
    expect(saved.json.program.days[0].exercises[0]).toMatchObject({ sets: 3, reps: '8-12' });

    const mine = await call('GET', '/api/me/program', undefined, pupil.token);
    expect(mine.status).toBe(200);
    expect(mine.json.program.title).toBe('برنامهٔ سه روزه');
    expect(mine.json.coachName).toBe('مربی یک');
  });

  it('saving again replaces the programme', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken);
    await call('PUT', `/api/students/${pupil.id}/program`, { ...goodProgramme, title: 'برنامهٔ جدید' }, coachToken);
    const read = await call('GET', `/api/students/${pupil.id}/program`, undefined, coachToken);
    expect(read.json.program.title).toBe('برنامهٔ جدید');
  });

  it('a student with no programme gets null, not an error', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const mine = await call('GET', '/api/me/program', undefined, pupil.token);
    expect(mine.status).toBe(200);
    expect(mine.json.program).toBeNull();
  });

  it('rejects an invalid programme with a clear message', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const badReps = { ...goodProgramme, days: [{ name: 'روز', exercises: [{ ...goodProgramme.days[0].exercises[0], reps: 'تا خستگی' }] }] };
    const res = await call('PUT', `/api/students/${pupil.id}/program`, badReps, coachToken);
    expect(res.status).toBe(400);
    expect(res.json.error).toContain('تکرار');

    const tooManySets = { ...goodProgramme, days: [{ name: 'روز', exercises: [{ ...goodProgramme.days[0].exercises[0], sets: 11 }] }] };
    expect((await call('PUT', `/api/students/${pupil.id}/program`, tooManySets, coachToken)).status).toBe(400);

    const badId = { ...goodProgramme, days: [{ name: 'روز', exercises: [{ ...goodProgramme.days[0].exercises[0], exerciseId: '../etc' }] }] };
    expect((await call('PUT', `/api/students/${pupil.id}/program`, badId, coachToken)).status).toBe(400);
  });

  it('a student cannot write a programme, and a coach cannot read another coach\'s student', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    expect((await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, pupil.token)).status).toBe(403);
    expect((await call('GET', '/api/me/program', undefined, coachToken)).status).toBe(403);

    const otherCoach = await coach();
    expect((await call('GET', `/api/students/${pupil.id}/program`, undefined, otherCoach)).status).toBe(404);
  });

  it('allows coach and admin to delete a programme', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken);

    // Coach deletes programme
    const delRes = await call('DELETE', `/api/students/${pupil.id}/program`, undefined, coachToken);
    expect(delRes.status).toBe(200);
    expect(delRes.json.ok).toBe(true);

    const check = await call('GET', `/api/students/${pupil.id}/program`, undefined, coachToken);
    expect(check.status).toBe(200);
    expect(check.json.program).toBeNull();

    // Admin can also manage and delete
    const adminToken = await signIn('owner', 'owner-pass-123');
    await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, adminToken);
    const adminRead = await call('GET', `/api/students/${pupil.id}/program`, undefined, adminToken);
    expect(adminRead.status).toBe(200);
    expect(adminRead.json.program.title).toBe('برنامهٔ سه روزه');

    const adminDel = await call('DELETE', `/api/students/${pupil.id}/program`, undefined, adminToken);
    expect(adminDel.status).toBe(200);
  });

  it('syncs personal workout programme across devices for signed-in users', async () => {
    const adminToken = await signIn('owner', 'owner-pass-123');

    // Initially no personal program on server
    const initial = await call('GET', '/api/me/personal-program', undefined, adminToken);
    expect(initial.status).toBe(200);
    expect(initial.json.program).toBeNull();

    // Admin saves personal program on laptop
    const myProgram = [
      {
        id: 'day-1',
        name: 'روز اول اختصاصی مدیر',
        dayLabel: 'روز ۰۱',
        focus: 'سینه و دست‌ها',
        durationMinutes: 50,
        description: 'تمرین سنگین',
        exercises: [],
      },
    ];
    const saveRes = await call('PUT', '/api/me/personal-program', { program: myProgram }, adminToken);
    expect(saveRes.status).toBe(200);
    expect(saveRes.json.ok).toBe(true);

    // Mobile phone logs in with same admin account and retrieves the program
    const phoneRead = await call('GET', '/api/me/personal-program', undefined, adminToken);
    expect(phoneRead.status).toBe(200);
    expect(phoneRead.json.program).toHaveLength(1);
    expect(phoneRead.json.program[0].name).toBe('روز اول اختصاصی مدیر');

    // Delete personal program
    const delRes = await call('DELETE', '/api/me/personal-program', undefined, adminToken);
    expect(delRes.status).toBe(200);
    const afterDel = await call('GET', '/api/me/personal-program', undefined, adminToken);
    expect(afterDel.json.program).toBeNull();
  });
});
