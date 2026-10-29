// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { createSession, hashPassword, userForToken } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { findUserByUsername, insertUser } from './users.ts';

const url = process.env.TEST_POSTGRES_URL;

describe.skipIf(!url)('PostgreSQL migration from the previous account schema', () => {
  it('preserves existing accounts, sessions, programmes and payments over repeated startups', async () => {
    const schema = `meety_registration_${randomBytes(10).toString('hex')}`;
    const root = new pg.Client({ connectionString: url });
    let db: Db | undefined;
    let created = false;
    const now = new Date('2026-10-29T09:00:00Z');
    try {
      await root.connect();
      await root.query(`CREATE SCHEMA "${schema}"`); created = true;
      const target = new URL(url!); target.searchParams.set('options', `-c search_path=${schema}`);
      db = await openDatabase(target.toString());
      const coach = await insertUser(db, { username: 'legacy-coach', passwordHash: hashPassword('coach-password'), role: 'coach', displayName: 'مربی', coachId: null, mustChangePassword: false, now });
      const student = await insertUser(db, { username: 'legacy-student', passwordHash: hashPassword('student-password'), role: 'student', displayName: 'شاگرد', coachId: coach, mustChangePassword: false, now });
      const token = (await createSession(db, student, 0, now))!;
      await db.query("INSERT INTO student_programs (student_id, coach_id, body, updated_at, price_tomans, programme_id, version) VALUES ($1, $2, $3, $4, 100, 'legacy-offer', 1)", [student, coach, JSON.stringify({ title: 'برنامهٔ قدیمی', days: [] }), now.toISOString()]);
      await db.query("INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, programme_id, programme_mapping) VALUES ($1, $2, 100, 90, 10, 'legacy-authority', 'paid', 'legacy-ref', $3, 'legacy-offer', 'explicit')", [student, coach, now.toISOString()]);
      await db.query("INSERT INTO nutrition_plans (student_id, coach_id, body, updated_at) VALUES ($1, $2, $3, $4)", [student, coach, JSON.stringify({ targets: { kcal: 2000 }, days: [] }), now.toISOString()]);
      await db.query("INSERT INTO student_biometrics (student_id, coach_id, limitations, updated_at) VALUES ($1, $2, 'سابقهٔ قدیمی', $3)", [student, coach, now.toISOString()]);
      // Restore the old checks, tables and account fields before exercising startup migrations.
      await db.exec("DROP TABLE nutrition_coach_plans, student_coach_biometrics, coach_registration_links; DELETE FROM app_data_migrations WHERE name = 'coach-biometrics-v1'; ALTER TABLE users DROP CONSTRAINT users_coach_role_check; ALTER TABLE users ADD CONSTRAINT legacy_coach_required CHECK ((role = 'student') = (coach_id IS NOT NULL)); ALTER TABLE users ADD CONSTRAINT unrelated_check CHECK (username <> 'forbidden'); ALTER TABLE users DROP COLUMN phone_number, DROP COLUMN self_registered, DROP COLUMN pending_approval, DROP COLUMN coach_access, DROP COLUMN coach_access_version, DROP COLUMN personal_program_mode, DROP COLUMN session_guard_version;");
      await db.close(); db = undefined;
      for (let startup = 0; startup < 2; startup++) {
        db = await openDatabase(target.toString());
        expect(await db.query("SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'coach_registration_links'")).toHaveLength(1);
        expect(await userForToken(db, token, now)).toEqual({ userId: student });
        expect(await findUserByUsername(db, 'legacy-student')).toMatchObject({ coachId: coach, phoneNumber: null, selfRegistered: false });
        expect((await db.query('SELECT programme_id FROM student_programs WHERE student_id = $1', [student]))[0]).toMatchObject({ programme_id: 'legacy-offer' });
        expect((await db.query('SELECT authority, status, ref_id FROM payment_transactions WHERE student_id = $1', [student]))[0]).toMatchObject({ authority: 'legacy-authority', status: 'paid', ref_id: 'legacy-ref' });
        expect((await db.query('SELECT coach_id, body FROM nutrition_coach_plans WHERE student_id = $1', [student]))[0]).toMatchObject({ coach_id: coach, body: expect.stringContaining('2000') });
        expect((await db.query('SELECT coach_id, limitations FROM student_coach_biometrics WHERE student_id = $1', [student]))[0]).toMatchObject({ coach_id: coach, limitations: 'سابقهٔ قدیمی' });
        expect(await db.query("SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'unrelated_check'")).toHaveLength(1);
        if (startup === 0) await insertUser(db, { username: 'new-independent', passwordHash: hashPassword('new-password'), role: 'student', displayName: 'مستقل', phoneNumber: '09123456789', coachId: null, selfRegistered: true, mustChangePassword: false, now });
        await db.close(); db = undefined;
      }
    } finally {
      await db?.close();
      try { if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await root.end(); }
    }
  }, 60000);
});
