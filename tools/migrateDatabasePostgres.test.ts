// @vitest-environment node
/**
 * The copy of the rows between two real PostgreSQL databases.
 *
 * The suite runs only when TEST_MIGRATION_DATABASE_URL points at a PostgreSQL that may be
 * emptied (the CI workflow starts one for it). The test creates a source and a target
 * database, fills the source and copies it, the same way the migration workflow does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { openDatabase, type Db } from '../server/db';
import { copyDatabases } from './migrate-database.mjs';

const baseUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? '';
const sourceName = 'meety_migration_source';
const targetName = 'meety_migration_target';

const urlFor = (name: string) => {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
};

const describePostgres = baseUrl ? describe : describe.skip;

describePostgres('the copy between two PostgreSQL databases', () => {
  let admin: pg.Pool;
  let source: Db;
  let target: Db;

  beforeAll(async () => {
    admin = new pg.Pool({ connectionString: baseUrl, max: 1 });
    for (const name of [sourceName, targetName]) {
      await admin.query(`DROP DATABASE IF EXISTS ${name}`);
      await admin.query(`CREATE DATABASE ${name}`);
    }
    source = await openDatabase(urlFor(sourceName));
    target = await openDatabase(urlFor(targetName));
  }, 60000);

  afterAll(async () => {
    await source?.close();
    await target?.close();
    if (admin) {
      for (const name of [sourceName, targetName]) await admin.query(`DROP DATABASE IF EXISTS ${name}`).catch(() => {});
      await admin.end();
    }
  }, 60000);

  it('counts the rows without writing anything', async () => {
    await source.query(
      `INSERT INTO users (username, password_hash, role, display_name, created_at) VALUES
        ('admin-1', 'hash-admin', 'admin', 'مدیر', '2026-01-01'),
        ('coach-1', 'hash-coach', 'coach', 'مربی', '2026-01-01'),
        ('student-1', 'hash-student', 'student', 'شاگرد', '2026-01-01')`,
    );
    await source.query(
      `UPDATE users SET coach_id = (SELECT id FROM users WHERE username = 'coach-1') WHERE username = 'student-1'`,
    );
    await source.query(
      `INSERT INTO student_programs (student_id, coach_id, body, updated_at)
        SELECT id, coach_id, '{"days":[]}', '2026-01-01' FROM users WHERE username = 'student-1'`,
    );

    const results = await copyDatabases(urlFor(sourceName), urlFor(targetName), { dryRun: true });
    const users = results.find((result) => result.table === 'users');
    expect(users?.rows).toBe(3);
    const copied = await target.query('SELECT count(*)::int AS count FROM users');
    expect(copied[0].count).toBe(0);
  }, 60000);

  it('copies the rows and keeps the password hashes', async () => {
    await copyDatabases(urlFor(sourceName), urlFor(targetName));

    const users = await target.query('SELECT username, password_hash, role FROM users ORDER BY username');
    expect(users.map((row: { username: string }) => row.username)).toEqual(['admin-1', 'coach-1', 'student-1']);
    const student = users.find((row: { username: string }) => row.username === 'student-1');
    expect(student.password_hash).toBe('hash-student');

    const programs = await target.query('SELECT count(*)::int AS count FROM student_programs');
    expect(programs[0].count).toBe(1);
  }, 60000);

  it('copies nothing twice and changes nothing', async () => {
    await target.query(`UPDATE users SET display_name = 'تغییر محلی' WHERE username = 'student-1'`);
    const results = await copyDatabases(urlFor(sourceName), urlFor(targetName));

    const users = await target.query('SELECT count(*)::int AS count FROM users');
    expect(users[0].count).toBe(3);
    const student = await target.query(`SELECT display_name FROM users WHERE username = 'student-1'`);
    expect(student[0].display_name).toBe('تغییر محلی');
    const programs = await target.query('SELECT count(*)::int AS count FROM student_programs');
    expect(programs[0].count).toBe(1);
    expect(results.every((result) => result.rows === 0 || result.skipped)).toBe(true);
  }, 60000);

  it('leaves the identity sequence of the accounts after the copied rows', async () => {
    await target.query(
      `INSERT INTO users (username, password_hash, role, display_name, created_at)
        VALUES ('student-2', 'hash-2', 'student', 'شاگرد دوم', '2026-01-02')`,
    );
    const rows = await target.query('SELECT id FROM users ORDER BY id');
    const ids = rows.map((row: { id: number }) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeGreaterThan(3);
  }, 60000);
});
