// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './db.ts';
import { createPaymentRequest, isProgramPaid, verifyPayment } from './payments.ts';
import { listPurchasedProgrammes, loadProgramme, saveProgramme, type ProgrammeInput } from './programs.ts';

const url = process.env.TEST_POSTGRES_URL;
const schema = `meety_sales_${randomBytes(10).toString('hex')}`;
const now = new Date('2026-10-27T12:00:00.000Z');
const input: ProgrammeInput = { title: 'برنامه یک', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'squat', name: 'اسکوات', muscle: 'پا', sets: 3, reps: '8-12', restSeconds: 90 }] }] };
let root: pg.Client | undefined;
let sql: pg.Client | undefined;
let db: Db | undefined;
let created = false;

describe.skipIf(!url)('PostgreSQL programme sales and concurrency', () => {
  beforeAll(async () => {
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
      (2, 'student', 'hash', 'student', 'شاگرد', 1, $1)`, [now.toISOString()]);
  }, 30000);

  afterAll(async () => {
    await db?.close();
    await sql?.end();
    if (root) {
      try { if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
      finally { await root.end(); }
    }
  }, 30000);

  it('permits one concurrent new offer and resumes one concurrent checkout', async () => {
    const first = await saveProgramme(db!, 2, 1, input, { mode: 'new', expectedId: null, expectedVersion: 0 }, now);
    const options = { mode: 'new' as const, expectedId: first.id, expectedVersion: first.version };
    const results = await Promise.allSettled([
      saveProgramme(db!, 2, 1, { ...input, title: 'برنامه الف' }, options, now),
      saveProgramme(db!, 2, 1, { ...input, title: 'برنامه ب' }, options, now),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const current = (await loadProgramme(db!, 2))!;
    const expected = { id: current.id, version: current.version };
    const checkouts = await Promise.all([
      createPaymentRequest(db!, 2, 'http://test.example', expected, now),
      createPaymentRequest(db!, 2, 'http://test.example', expected, now),
    ]);
    expect(checkouts[0]!.authority).toBe(checkouts[1]!.authority);
    expect((await db!.query("SELECT id FROM payment_transactions WHERE student_id = 2 AND status = 'pending'"))).toHaveLength(1);
    expect((await verifyPayment(db!, checkouts[0]!.authority, 'OK', now)).success).toBe(true);
    expect(await isProgramPaid(db!, 2, current.id)).toBe(true);
    expect(await isProgramPaid(db!, 2, first.id)).toBe(false);
    await saveProgramme(db!, 2, 1, { ...input, title: 'برنامه بعدی' }, {
      mode: 'new', expectedId: current.id, expectedVersion: current.version,
    }, now);
    const archive = await listPurchasedProgrammes(db!, 2, null);
    expect(archive.programs.map((program) => program.id)).toContain(current.id);
  }, 30000);

  it('rolls back the active row if archiving fails', async () => {
    const before = (await loadProgramme(db!, 2))!;
    await sql!.query(`CREATE FUNCTION reject_archive_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive error'; END $$`);
    await sql!.query('CREATE TRIGGER reject_archive BEFORE INSERT OR UPDATE ON programme_offers FOR EACH ROW EXECUTE FUNCTION reject_archive_test()');
    try {
      await expect(saveProgramme(db!, 2, 1, { ...input, title: 'نباید ذخیره شود' }, {
        mode: 'new', expectedId: before.id, expectedVersion: before.version,
      }, now)).rejects.toThrow('archive error');
      expect(await loadProgramme(db!, 2)).toEqual(before);
    } finally {
      await sql!.query('DROP TRIGGER IF EXISTS reject_archive ON programme_offers');
      await sql!.query('DROP FUNCTION IF EXISTS reject_archive_test()');
    }
  }, 30000);
});
