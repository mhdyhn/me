// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from './db.ts';
import { isProgramPaid } from './payments.ts';
import { listPurchasedProgrammes, saveProgramme, type ProgrammeInput } from './programs.ts';
import { allowTestPurchase, confirmTestPurchase, startTestPurchase, testPurchaseState } from './testPurchases.ts';

const url = process.env.TEST_POSTGRES_URL;
const schema = `meety_test_buy_${randomBytes(10).toString('hex')}`;
const now = new Date('2026-10-28T08:00:00Z');
const input: ProgrammeInput = { title: 'برنامه آزمایشی', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'squat', name: 'اسکوات', muscle: 'پا', sets: 3, reps: '8-12', restSeconds: 90 }] }] };
let root: pg.Client | undefined;
let sql: pg.Client | undefined;
let db: Db | undefined;
let created = false;

describe.skipIf(!url)('PostgreSQL isolated test purchases', () => {
  beforeAll(async () => {
    vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
    vi.stubEnv('STUDENT_TEST_PURCHASES', 'on');
    root = new pg.Client({ connectionString: url });
    await root.connect();
    await root.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const target = new URL(url!);
    target.searchParams.set('options', `-c search_path=${schema}`);
    sql = new pg.Client({ connectionString: target.toString() });
    await sql.connect();
    db = await openDatabase(target.toString());
    await db.query(`INSERT INTO users (id, username, password_hash, role, display_name, coach_id, created_at)
      OVERRIDING SYSTEM VALUE VALUES (1, 'coach', 'hash', 'coach', 'مربی', NULL, $1),
      (2, 'student-a', 'hash', 'student', 'شاگرد الف', 1, $1),
      (3, 'student-b', 'hash', 'student', 'شاگرد ب', 1, $1)`, [now.toISOString()]);
  }, 30000);

  afterAll(async () => {
    await db?.close();
    await sql?.end();
    if (root) {
      try { if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await root.end(); }
    }
    vi.unstubAllEnvs();
  }, 30000);

  it('coalesces concurrent test checkout starts without creating real entitlement or income', async () => {
    const program = await saveProgramme(db!, 2, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const expected = { id: program.id, version: program.version };
    await allowTestPurchase(db!, 2, expected, now);
    const [first, second] = await Promise.all([startTestPurchase(db!, 2, expected, now), startTestPurchase(db!, 2, expected, now)]);
    expect(first.authority).toBe(second.authority);
    const result = await Promise.all([confirmTestPurchase(db!, 2, first.authority, 'success', now), confirmTestPurchase(db!, 2, first.authority, 'success', now)]);
    expect(result.map((row) => row.success)).toEqual([true, true]);
    expect((await testPurchaseState(db!, 2, program.id, now))?.status).toBe('paid');
    expect(await isProgramPaid(db!, 2, program.id)).toBe(false);
    expect(await db!.query('SELECT * FROM payment_transactions')).toEqual([]);
    expect((await listPurchasedProgrammes(db!, 2, null)).programs).toEqual([]);
  }, 30000);

  it('rejects confirmation that races with a locked programme version change', async () => {
    const program = await saveProgramme(db!, 3, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const expected = { id: program.id, version: program.version };
    await allowTestPurchase(db!, 3, expected, now);
    const checkout = await startTestPurchase(db!, 3, expected, now);
    await sql!.query('BEGIN');
    try {
      await sql!.query('UPDATE student_programs SET version = version + 1, price_tomans = 200000 WHERE student_id = 3');
      const verification = confirmTestPurchase(db!, 3, checkout.authority, 'success', now)
        .then(() => ({ error: null }), (error: unknown) => ({ error }));
      // Ensure the confirmation really waits on the version change, not just runs after it.
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const activity = await root!.query(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%UPDATE payment_test_purchases AS test SET status%'
        ) AS waiting`);
        waiting = activity.rows[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await sql!.query('COMMIT');
      expect((await verification).error).toMatchObject({ status: 409 });
      expect((await testPurchaseState(db!, 3, program.id, now))?.status).toBe('pending');
      expect(await db!.query('SELECT * FROM payment_transactions')).toEqual([]);
    } finally {
      await sql!.query('ROLLBACK');
    }
  }, 30000);
});
