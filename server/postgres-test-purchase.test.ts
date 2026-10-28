// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { openDatabase, type Db } from './db.ts';
import { isProgramPaid } from './payments.ts';
import { listPurchasedProgrammes, saveProgramme, type ProgrammeInput } from './programs.ts';
import { allowTestPurchase, confirmTestPurchase, getTestMode, setTestMode, startTestPurchase, testPurchaseState } from './testPurchases.ts';

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
    vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
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
      (3, 'student-b', 'hash', 'student', 'شاگرد ب', 1, $1),
      (4, 'student-c', 'hash', 'student', 'شاگرد پ', 1, $1),
      (5, 'student-d', 'hash', 'student', 'شاگرد ت', 1, $1),
      (6, 'student-e', 'hash', 'student', 'شاگرد ث', 1, $1),
      (7, 'student-f', 'hash', 'student', 'شاگرد ج', 1, $1)`, [now.toISOString()]);
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
    expect(await db!.query('SELECT status, amount_tomans, coach_share_tomans, admin_share_tomans FROM payment_test_transactions WHERE student_id = 2')).toEqual([
      { status: 'paid', amount_tomans: 100000, coach_share_tomans: 90000, admin_share_tomans: 10000 },
    ]);
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

  it('serializes global concurrent starts and opposing confirmations into one consistent test record', async () => {
    await setTestMode(db!, 1, true, now);
    const program = await saveProgramme(db!, 4, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const expected = { id: program.id, version: program.version };
    const starts = await Promise.all(Array.from({ length: 5 }, () => startTestPurchase(db!, 4, expected, now)));
    expect(new Set(starts.map((s) => s.authority)).size).toBe(1);
    const results = await Promise.all([
      confirmTestPurchase(db!, 4, starts[0].authority, 'success', now),
      confirmTestPurchase(db!, 4, starts[0].authority, 'cancel', now),
      confirmTestPurchase(db!, 4, starts[0].authority, 'success', now),
    ]);
    expect(new Set(results.map((r) => r.success)).size).toBe(1);
    const ledger = await db!.query<{ status: string }>('SELECT status FROM payment_test_transactions WHERE student_id = 4');
    expect(ledger).toHaveLength(1);
    expect(ledger[0].status).toBe(results[0].success ? 'paid' : 'canceled');
    expect((await testPurchaseState(db!, 4, program.id, now))?.status).toBe(ledger[0].status);
    expect(await db!.query('SELECT * FROM payment_transactions')).toEqual([]);
  }, 30000);

  it('cannot create a test checkout after a concurrent mode shutdown commits', async () => {
    await setTestMode(db!, 1, true, now);
    const program = await saveProgramme(db!, 5, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const expected = { id: program.id, version: program.version };
    await sql!.query('BEGIN');
    try {
      await sql!.query('UPDATE payment_test_mode SET token = NULL, expires_at = NULL WHERE id = 1');
      const purchase = startTestPurchase(db!, 5, expected, now).then(() => ({ error: null }), (error: unknown) => ({ error }));
      const deadline = Date.now() + 3000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const activity = await root!.query(`SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%INSERT INTO payment_test_purchases AS p%'
        ) AS waiting`);
        waiting = activity.rows[0].waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(waiting).toBe(true);
      await sql!.query('COMMIT');
      expect((await purchase).error).toMatchObject({ status: 409 });
      expect(await getTestMode(db!, now)).toMatchObject({ enabled: false });
      expect(await db!.query('SELECT * FROM payment_test_transactions WHERE student_id = 5')).toEqual([]);
    } finally {
      await sql!.query('ROLLBACK');
    }
  }, 30000);

  it('cannot confirm a global purchase after a concurrent mode shutdown commits', async () => {
    await setTestMode(db!, 1, true, now);
    const program = await saveProgramme(db!, 6, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const checkout = await startTestPurchase(db!, 6, { id: program.id, version: program.version }, now);
    await sql!.query('BEGIN');
    try {
      await sql!.query('UPDATE payment_test_mode SET token = NULL, expires_at = NULL WHERE id = 1');
      const confirmation = confirmTestPurchase(db!, 6, checkout.authority, 'success', now).then(() => ({ error: null }), (error: unknown) => ({ error }));
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
      expect((await confirmation).error).toMatchObject({ status: 409 });
      expect(await testPurchaseState(db!, 6, program.id, now)).toBeNull();
      expect((await db!.query<{ status: string }>('SELECT status FROM payment_test_transactions WHERE student_id = 6'))[0].status).toBe('pending');
    } finally {
      await sql!.query('ROLLBACK');
    }
  }, 30000);

  it('rolls back the authorization update if the financial insert fails', async () => {
    const program = await saveProgramme(db!, 7, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const expected = { id: program.id, version: program.version };
    await allowTestPurchase(db!, 7, expected, now);
    await db!.query('ALTER TABLE payment_test_transactions ADD CONSTRAINT test_reject_insert CHECK (amount_tomans <> 100000) NOT VALID');
    try {
      await expect(startTestPurchase(db!, 7, expected, now)).rejects.toThrow();
      expect((await testPurchaseState(db!, 7, program.id, now))?.status).toBe('allowed');
      expect(await db!.query('SELECT * FROM payment_test_transactions WHERE student_id = 7')).toEqual([]);
      expect(await db!.query('SELECT * FROM payment_transactions')).toEqual([]);
    } finally {
      await db!.query('ALTER TABLE payment_test_transactions DROP CONSTRAINT test_reject_insert');
    }
  }, 30000);
});
