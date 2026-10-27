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

  it('keeps the assigned coach as programme owner when the admin saves it', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const coachId = (await call('GET', '/api/me', undefined, coachToken)).json.user.id;
    const adminToken = await signIn('owner', 'owner-pass-123');

    expect((await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, adminToken)).status).toBe(200);
    const rows = await db.query<{ coach_id: number }>('SELECT coach_id FROM student_programs WHERE student_id = $1', [pupil.id]);
    expect(Number(rows[0]?.coach_id)).toBe(coachId);
    expect((await call('GET', `/api/students/${pupil.id}/program`, undefined, coachToken)).json.program.title).toBe(goodProgramme.title);
    expect((await call('GET', '/api/me/program', undefined, pupil.token)).json.program.title).toBe(goodProgramme.title);
  });

  it('requires a version and an explicit decision before replacing the programme', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken)).json.program;
    expect((await call('PUT', `/api/students/${pupil.id}/program`, { ...goodProgramme, title: 'برنامهٔ جدید' }, coachToken)).status).toBe(409);
    const saved = await call('PUT', `/api/students/${pupil.id}/program`, {
      ...goodProgramme, title: 'برنامهٔ جدید', saveMode: 'new', expectedId: first.id, expectedVersion: first.version,
    }, coachToken);
    expect(saved.status).toBe(200);
    expect(saved.json.program.id).not.toBe(first.id);
    const read = await call('GET', `/api/students/${pupil.id}/program`, undefined, coachToken);
    expect(read.json.program.title).toBe('برنامهٔ جدید');
  });

  it('keeps an edited purchase unlocked, sells a new programme separately and preserves the archive', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, { ...goodProgramme, priceTomans: 100000 }, coachToken)).json.program;
    const checkout = await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, pupil.token);
    expect(checkout.status).toBe(201);
    // A second device gets the same pending checkout, not a second charge request.
    const again = await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, pupil.token);
    expect(again.json.authority).toBe(checkout.json.authority);
    expect((await call('POST', '/api/pay/verify', { authority: checkout.json.authority, status: 'OK' }, pupil.token)).json.success).toBe(true);
    const edit = await call('PUT', `/api/students/${pupil.id}/program`, {
      ...goodProgramme, title: 'اصلاح برنامه', priceTomans: 150000, saveMode: 'edit', expectedId: first.id, expectedVersion: first.version,
    }, coachToken);
    expect(edit.status).toBe(200);
    expect(edit.json.program.id).toBe(first.id);
    expect((await call('GET', '/api/me/program', undefined, pupil.token)).json.isPaid).toBe(true);
    const next = await call('PUT', `/api/students/${pupil.id}/program`, {
      ...goodProgramme, title: 'برنامهٔ دوم', priceTomans: 200000, saveMode: 'new', expectedId: edit.json.program.id, expectedVersion: edit.json.program.version,
    }, coachToken);
    expect(next.status).toBe(200);
    expect(next.json.program.id).not.toBe(first.id);
    const locked = await call('GET', '/api/me/program', undefined, pupil.token);
    expect(locked.json.isPaid).toBe(false);
    expect(locked.json.program.days).toEqual([]);
    const archive = await call('GET', '/api/me/programs/archive', undefined, pupil.token);
    expect(archive.json.programs).toHaveLength(1);
    expect(archive.json.programs[0].title).toBe('اصلاح برنامه');
    expect(archive.json.programs[0].days).toHaveLength(1);
    const secondPupil = await student(coachToken);
    expect((await call('GET', '/api/me/programs/archive', undefined, secondPupil.token)).json.programs).toEqual([]);
    expect((await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, pupil.token)).status).toBe(409);
    const second = await call('POST', '/api/pay/start', { expectedId: next.json.program.id, expectedVersion: next.json.program.version }, pupil.token);
    expect(second.status).toBe(201);
    expect(second.json.authority).not.toBe(checkout.json.authority);
    expect((await call('POST', '/api/pay/verify', { authority: second.json.authority, status: 'OK' }, pupil.token)).json.success).toBe(true);
    expect((await call('GET', '/api/me/program', undefined, pupil.token)).json.isPaid).toBe(true);
  });

  it('does not silently resume a pending checkout at a different advertised price', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, { ...goodProgramme, priceTomans: 100000 }, coachToken)).json.program;
    const checkout = await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, pupil.token);
    expect(checkout.status).toBe(201);
    const edited = (await call('PUT', `/api/students/${pupil.id}/program`, {
      ...goodProgramme, priceTomans: 200000, saveMode: 'edit', expectedId: first.id, expectedVersion: first.version,
    }, coachToken)).json.program;
    const retry = await call('POST', '/api/pay/start', { expectedId: edited.id, expectedVersion: edited.version }, pupil.token);
    expect(retry.status).toBe(409);
    expect(retry.json.error).toContain('پرداخت تکراری');
    expect((await call('POST', '/api/pay/verify', { authority: checkout.json.authority, status: 'OK' }, pupil.token)).json.success).toBe(true);
    expect((await call('GET', '/api/me/program', undefined, pupil.token)).json.isPaid).toBe(true);
  });

  it('binds a late payment to the programme that was bought, not a newer one', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, { ...goodProgramme, priceTomans: 100000 }, coachToken)).json.program;
    const checkout = await call('POST', '/api/pay/start', { expectedId: first.id, expectedVersion: first.version }, pupil.token);
    expect(checkout.status).toBe(201);
    const next = await call('PUT', `/api/students/${pupil.id}/program`, {
      ...goodProgramme, title: 'برنامهٔ بعدی', priceTomans: 300000, saveMode: 'new', expectedId: first.id, expectedVersion: first.version,
    }, coachToken);
    expect(next.status).toBe(200);
    const verified = await call('POST', '/api/pay/verify', { authority: checkout.json.authority, status: 'OK' }, pupil.token);
    expect(verified.json.success).toBe(true);
    expect(verified.json.message).toContain('بایگانی');
    expect((await call('GET', '/api/me/program', undefined, pupil.token)).json.isPaid).toBe(false);
    const archive = await call('GET', '/api/me/programs/archive', undefined, pupil.token);
    expect(archive.json.programs).toHaveLength(1);
    expect(archive.json.programs[0].id).toBe(first.id);
  });

  it('prevents stale editors and simultaneous new-programme saves from overwriting one another', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken)).json.program;
    const request = { ...goodProgramme, saveMode: 'new', expectedId: first.id, expectedVersion: first.version };
    const results = await Promise.all([
      call('PUT', `/api/students/${pupil.id}/program`, { ...request, title: 'جدید الف' }, coachToken),
      call('PUT', `/api/students/${pupil.id}/program`, { ...request, title: 'جدید ب' }, coachToken),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect((await call('DELETE', `/api/students/${pupil.id}/program`, { expectedId: first.id, expectedVersion: first.version }, coachToken)).status).toBe(409);
  });

  it('pages through a large archive without exposing another student’s programmes', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const other = await student(coachToken);
    const coachId = (await call('GET', '/api/me', undefined, coachToken)).json.user.id;
    await db.query(`INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at)
      SELECT 'archive-' || n::text, $1, $2, $3, 0, $4, $4 FROM generate_series(1, 25) n`,
    [pupil.id, coachId, JSON.stringify(goodProgramme), clock.toISOString()]);
    const first = await call('GET', '/api/me/programs/archive', undefined, pupil.token);
    expect(first.json.programs).toHaveLength(20);
    expect(first.json.nextCursor).toBeTruthy();
    const second = await call('GET', `/api/me/programs/archive?cursor=${encodeURIComponent(first.json.nextCursor)}`, undefined, pupil.token);
    expect(second.json.programs).toHaveLength(5);
    expect(second.json.nextCursor).toBeNull();
    const ids = [...first.json.programs, ...second.json.programs].map((program: { id: string }) => program.id);
    expect(new Set(ids).size).toBe(25);
    expect((await call('GET', '/api/me/programs/archive', undefined, other.token)).json.programs).toEqual([]);
    const foreignCursor = await call('GET', `/api/me/programs/archive?cursor=${encodeURIComponent(first.json.nextCursor)}`, undefined, other.token);
    expect(foreignCursor.json.programs).toEqual([]);
    expect((await call('GET', `/api/me/programs/archive?cursor=${'a'.repeat(129)}`, undefined, pupil.token)).status).toBe(400);
  });

  it('a student with no programme gets null, not an error', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const mine = await call('GET', '/api/me/program', undefined, pupil.token);
    expect(mine.status).toBe(200);
    expect(mine.json.program).toBeNull();
  });

  it('accepts Persian digits, en-dash, and descriptive day names', async () => {
    const coachToken = await coach();
    const pupil = await student(coachToken);
    const persianProgramme = {
      title: 'برنامهٔ پیشرفته',
      days: [
        {
          name: 'روز ۱: پوش (سینه، سرشانه و پشت‌بازو)',
          exercises: [
            {
              exerciseId: 'barbell-bench-press',
              name: 'پرس سینه با هالتر',
              muscle: 'سینه',
              sets: 3,
              reps: '۸-۱۲',
              restSeconds: 90,
            },
            {
              exerciseId: 'shoulder-press',
              name: 'پرس سرشانه',
              muscle: 'سرشانه',
              sets: 3,
              reps: '8–12', // en-dash
              restSeconds: 90,
            },
          ],
        },
      ],
    };
    const res = await call('PUT', `/api/students/${pupil.id}/program`, persianProgramme, coachToken);
    expect(res.status).toBe(200);
    expect(res.json.program.days[0].exercises[0].reps).toBe('8-12');
    expect(res.json.program.days[0].exercises[1].reps).toBe('8-12');
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
    const first = (await call('PUT', `/api/students/${pupil.id}/program`, goodProgramme, coachToken)).json.program;

    // Coach removes the current programme, without deleting its archive.
    const delRes = await call('DELETE', `/api/students/${pupil.id}/program`, { expectedId: first.id, expectedVersion: first.version }, coachToken);
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

    const adminDel = await call('DELETE', `/api/students/${pupil.id}/program`, { expectedId: adminRead.json.program.id, expectedVersion: adminRead.json.program.version }, adminToken);
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
    const saveRes = await call('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [{ kind: 'program', key: 'main', baseVersion: 0, operationId: 'program-test-create', deleted: false, value: myProgram }] }, adminToken);
    expect(saveRes.status).toBe(200);
    expect(saveRes.json.results[0].status).toBe('saved');
    expect((await call('PUT', '/api/me/personal-program', { program: myProgram }, adminToken)).status).toBe(409);

    // Mobile phone logs in with same admin account and retrieves the program
    const phoneRead = await call('GET', '/api/me/personal-program', undefined, adminToken);
    expect(phoneRead.status).toBe(200);
    expect(phoneRead.json.program).toHaveLength(1);
    expect(phoneRead.json.program[0].name).toBe('روز اول اختصاصی مدیر');

    // Delete personal program
    const delRes = await call('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [{ kind: 'program', key: 'main', baseVersion: 1, operationId: 'program-test-delete', deleted: true, value: null }] }, adminToken);
    expect(delRes.status).toBe(200);
    expect(delRes.json.results[0].status).toBe('saved');
    const afterDel = await call('GET', '/api/me/personal-program', undefined, adminToken);
    expect(afterDel.json.program).toBeNull();
  });
});
