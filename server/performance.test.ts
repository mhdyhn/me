// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { createSession, resetUserPassword } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { saveProgramme, studentProgrammeView } from './programs.ts';
import { keyFromSecret } from './secrets.ts';
import { findUserBySession, insertUser } from './users.ts';

let db: Db;
let server: Server;
let base: string;
let count = 0;
let studentId: number;
let coachId: number;
let programmeId: string;
let tokens: Record<string, string>;
const clock = new Date('2026-10-29T12:00:00Z');

beforeAll(async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
  vi.stubEnv('STUDENT_TEST_PURCHASES', 'on');
  db = await openDatabase('memory');
  const common = { passwordHash: 'synthetic', mustChangePassword: false, now: clock };
  const admin = await insertUser(db, { ...common, username: 'admin', role: 'admin', displayName: 'مدیر', coachId: null });
  coachId = await insertUser(db, { ...common, username: 'coach', role: 'coach', displayName: 'مربی', coachId: null });
  studentId = await insertUser(db, { ...common, username: 'student', role: 'student', displayName: 'شاگرد', coachId });
  const independent = await insertUser(db, { ...common, username: 'independent', role: 'student', displayName: 'مستقل', coachId: null });
  tokens = Object.fromEntries(await Promise.all(Object.entries({ admin, coach: coachId, student: studentId, independent }).map(async ([role, id]) => [role, (await createSession(db, id, 0, clock))!])));
  const programme = await saveProgramme(db, studentId, coachId, {
    title: 'پیشنهاد آزمایشی', priceTomans: 100000,
    days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }],
  }, { mode: 'new', expectedId: null, expectedVersion: 0 }, clock);
  programmeId = programme.id;
  const counted: Db = {
    async query(sql, params) { count += 1; return db.query(sql, params); },
    exec: (sql) => db.exec(sql), close: () => db.close(),
  };
  server = createServer(createApp({ db: counted, secretKey: keyFromSecret('local-synthetic-test-secret'), now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (db) await db.close();
  vi.unstubAllEnvs();
});

async function get(path: string, token: string) {
  count = 0;
  const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
  return { status: response.status, headers: response.headers, json: await response.json() as Record<string, any>, queries: count };
}

describe('bounded database round trips and entitlement safety', () => {
  it('reports only the simple database health-check duration', async () => {
    const response = await fetch(base + '/api/health');
    const health = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(health).toMatchObject({ ok: true, database: true });
    expect(health.databaseMs).toEqual(expect.any(Number));
    expect(Number(health.databaseMs)).toBeGreaterThanOrEqual(0);
  });

  it('authenticates student, independent, coach and admin in one query without returning secrets', async () => {
    for (const role of ['student', 'independent', 'coach', 'admin']) {
      const result = await get('/api/me', tokens[role]!);
      expect(result.status).toBe(200);
      expect(result.queries).toBe(1);
      expect(result.json.user.username).toBe(role);
      expect(JSON.stringify(result.json)).not.toMatch(/passwordHash|passwordEnc|authVersion/);
    }
    const invalid = await get('/api/me', 'invalid-token-000000000000000');
    expect(invalid.status).toBe(401);
    expect(invalid.queries).toBe(1);
  });

  it('reads a locked offer in two queries and keeps exercises private', async () => {
    const result = await get('/api/me/program', tokens.student!);
    expect(result.queries).toBe(2);
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(result.json).toMatchObject({ coachName: 'مربی', isPaid: false, testPurchaseAvailable: false, program: { id: programmeId, days: [] } });
    expect((await get('/api/me/program', tokens.independent!))).toMatchObject({ queries: 1, json: { program: null, isPaid: true } });
  });

  it('unlocks only this offer with a real, valid payment in production', async () => {
    await db.query(`INSERT INTO payment_transactions
      (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, gateway_mode, programme_id)
      VALUES ($1, $2, 100000, 90000, 10000, 'benchmark-authority', 'paid', 'SANDBOX-123', $3, 'sandbox', $4)`,
    [studentId, coachId, clock.toISOString(), programmeId]);
    for (const [mode, ref, offer, expected] of [
      ['sandbox', '123456', programmeId, false], ['live', 'SANDBOX-123', programmeId, false],
      ['live', 'undefined', programmeId, false], ['live', '123456', 'another-offer', false],
      ['live', '123456', programmeId, true],
    ] as const) {
      await db.query('UPDATE payment_transactions SET gateway_mode=$1, ref_id=$2, programme_id=$3 WHERE authority=$4', [mode, ref, offer, 'benchmark-authority']);
      const result = await get('/api/me/program', tokens.student!);
      expect(result.queries).toBe(2);
      expect(result.json.isPaid).toBe(expected);
      expect(result.json.program.days.length).toBe(expected ? 1 : 0);
    }
    await db.query("DELETE FROM payment_transactions WHERE authority='benchmark-authority'");
  });

  it('rejects a snapshot if the relationship changes after authentication', async () => {
    const original = (await findUserBySession(db, tokens.student!, clock))!;
    await db.query('UPDATE users SET coach_access_version = coach_access_version + 1 WHERE id = $1', [studentId]);
    await expect(studentProgrammeView(db, original, clock)).rejects.toMatchObject({ status: 409 });
    const result = await get('/api/me/program', tokens.student!);
    expect(result.status).toBe(200);
    expect(result.json.program.days).toEqual([]);
  });

  it('expires and revokes sessions in the combined account lookup', async () => {
    expect(await findUserBySession(db, tokens.coach!, new Date(clock.getTime() + 31 * 86400000))).toBeNull();
    const admin = (await findUserBySession(db, tokens.admin!, clock))!;
    expect(await resetUserPassword(db, admin.id, 'new-synthetic-hash', 'encrypted')).toBe(true);
    expect(await findUserBySession(db, tokens.admin!, clock)).toBeNull();
    expect((await get('/api/me', tokens.admin!)).status).toBe(401);
  });
});
