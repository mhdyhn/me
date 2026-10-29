// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptCoachInvitation, makeCoachInvitation, returnToPersonalProgram, withdrawCoachAccess } from './coachInvites.ts';
import { deleteProgramme, listCoachProgrammes, restoreCoachProgramme, saveProgramme } from './programs.ts';
import { emptyPlan, loadDiary, loadPlan, saveDiary, savePlan } from './nutrition.ts';
import { loadBiometrics, migrateBiometrics, saveBiometrics } from './biometrics.ts';
import { addMessage } from './chat.ts';
import { allowTestPurchase, confirmTestPurchase, listTestTransactions, startTestPurchase } from './testPurchases.ts';
import { createPaymentRequest, isProgramPaid } from './payments.ts';
import { applyPersonalChange } from './personalData.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { deleteUser, findUserById, insertUser, type Role, type StoredUser } from './users.ts';
import { migrateAccountHistory } from './accountHistory.ts';
import { saveStudentProfile, setStudentProfileSharing } from './studentProfile.ts';

const url = process.env.TEST_POSTGRES_URL;
const schema = `meety_invite_${randomBytes(10).toString('hex')}`;
const now = new Date('2026-10-29T09:00:00Z');
const key = keyFromSecret('postgres-invitation-test-secret');
const profile = { age: 28, sex: 'زن', heightCm: 168, weightKg: 64, primaryGoal: 'آمادگی', secondaryGoal: '', trainingExperience: 'تازه‌کار', trainingDays: 3, sessionMinutes: 45, dailyActivity: 'سبک', sleepHours: '۷ ساعت', stressLevel: 0, injuries: 'ندارد', equipment: 'باشگاه', workingWeightReferences: [] };
let root: pg.Client | undefined;
let sql: pg.Client | undefined;
let db: Db | undefined;
let created = false;
let sequence = 0;

async function user(role: Role, selfRegistered = false): Promise<StoredUser> {
  const username = `${role}-${++sequence}`;
  const id = await insertUser(db!, { username, passwordHash: 'not-used', role, displayName: username, coachId: null, selfRegistered, mustChangePassword: false, now });
  return (await findUserById(db!, id))!;
}
const issue = (coach: StoredUser) => makeCoachInvitation(db!, key, coach, now);
const attach = (student: StoredUser, code: string) => acceptCoachInvitation(db!, key, student, { accountId: student.id, code, consent: true }, now);
const txDb = (): Db => ({
  query: async <T extends Record<string, any>>(statement: string, params: unknown[] = []) => (await sql!.query(statement, params)).rows as T[],
  exec: async (statement) => { await sql!.query(statement); }, close: async () => {},
});
const programme = { title: 'برنامهٔ قبلی', priceTomans: 100000, days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
async function waitForLock(queryFragment: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const activity = await root!.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1) AS waiting`, [`%${queryFragment}%`]);
    if (activity.rows[0].waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Expected the sharing query to wait for the locked user row');
}

describe.skipIf(!url)('PostgreSQL coach invitations and consent races', () => {
  beforeAll(async () => {
    root = new pg.Client({ connectionString: url }); await root.connect();
    await root.query(`CREATE SCHEMA "${schema}"`); created = true;
    const target = new URL(url!); target.searchParams.set('options', `-c search_path=${schema}`);
    sql = new pg.Client({ connectionString: target.toString() }); await sql.connect();
    db = await openDatabase(target.toString());
  }, 30000);
  afterAll(async () => {
    await db?.close(); await sql?.end();
    if (root) { try { if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); } finally { await root.end(); } }
  }, 30000);

  it('atomically accepts only one concurrent edit of the same diary base', async () => {
    const student = await user('student');
    const day = '2026-10-29';
    const results = await Promise.allSettled([
      saveDiary(db!, student.id, day, [{ name: 'الف', items: [] }], now.toISOString(), []),
      saveDiary(db!, student.id, day, [{ name: 'ب', items: [] }], now.toISOString(), []),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect(['الف', 'ب']).toContain((await loadDiary(db!, student.id, day)).meals[0]?.name);
  }, 30000);

  it('atomically accepts only one concurrent edit of the same weekly plan base', async () => {
    const coach = await user('coach'); const student = await user('student', true);
    const connected = await attach(student, (await issue(coach)).code);
    const { updatedAt: _updatedAt, ...base } = emptyPlan();
    const one = { ...base, targets: { ...base.targets, kcal: 2100 } };
    const two = { ...base, targets: { ...base.targets, kcal: 1800 } };
    const results = await Promise.allSettled([
      savePlan(db!, student.id, coach.id, one, now.toISOString(), connected.coachAccessVersion, base),
      savePlan(db!, student.id, coach.id, two, now.toISOString(), connected.coachAccessVersion, base),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ status: 409 });
    expect([1800, 2100]).toContain((await loadPlan(db!, student.id, coach.id))?.targets.kcal);
  }, 30000);

  it('upgrades old cascading history constraints in PostgreSQL without losing rows', async () => {
    const coach = await user('coach'); const student = await user('student');
    const refs = [
      ['payment_transactions', 'student_id'], ['payment_transactions', 'coach_id'],
      ['payment_test_transactions', 'student_id'], ['payment_test_transactions', 'coach_id'],
      ['messages', 'coach_id'], ['messages', 'sender_id'],
      ['admin_coach_messages', 'coach_id'], ['admin_coach_messages', 'sender_id'],
    ];
    for (const [table, column] of refs) {
      await db!.exec(`ALTER TABLE ${table} DROP CONSTRAINT ${table}_${column}_fkey;
        ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey FOREIGN KEY (${column}) REFERENCES users(id) ON DELETE CASCADE`);
    }
    await db!.query("INSERT INTO messages (coach_id, student_id, sender_id, body, created_at) VALUES ($1, $2, $1, 'old coach', $3), ($1, $2, $2, 'old student', $3)", [coach.id, student.id, now.toISOString()]);
    await migrateAccountHistory(db!); await migrateAccountHistory(db!);
    const actions = await db!.query<{ conname: string; confdeltype: string }>(`SELECT conname, confdeltype FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace AND conname = ANY($1::text[])`, [refs.map(([table, column]) => `${table}_${column}_fkey`)]);
    expect(actions).toHaveLength(refs.length);
    expect(actions.every((row) => row.confdeltype === 'a')).toBe(true);
    await expect(deleteUser(db!, coach.id)).rejects.toMatchObject({ status: 409 });
    expect(await db!.query('SELECT body FROM messages WHERE coach_id = $1 ORDER BY id', [coach.id])).toEqual([{ body: 'old coach' }, { body: 'old student' }]);
    await deleteUser(db!, student.id);
    expect(await db!.query('SELECT id FROM messages WHERE coach_id = $1', [coach.id])).toHaveLength(0);
  }, 30000);

  it.each(['payment_transactions', 'payment_test_transactions'])('does not delete an account while a %s record commits concurrently', async (table) => {
    const coach = await user('coach'); const student = await user('student');
    await sql!.query('BEGIN');
    try {
      if (table === 'payment_transactions') {
        await sql!.query(`INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, created_at)
          VALUES ($1, $2, 100, 90, 10, $3, 'paid', $4)`, [student.id, coach.id, `financial-${student.id}`, now.toISOString()]);
      } else {
        await sql!.query(`INSERT INTO payment_test_transactions (student_id, coach_id, programme_id, programme_version, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, created_at, expires_at)
          VALUES ($1, $2, 'offer', 1, 100, 90, 10, $3, 'paid', $4, $4)`, [student.id, coach.id, `test-financial-${student.id}`, now.toISOString()]);
      }
      const deletion = deleteUser(db!, student.id).then(() => null, (error: unknown) => error);
      await waitForLock('DELETE FROM users');
      await sql!.query('COMMIT');
      await expect(deletion).resolves.toMatchObject({ status: 409 });
      expect(await db!.query('SELECT id FROM users WHERE id = $1', [student.id])).toHaveLength(1);
      expect(await db!.query(`SELECT id FROM ${table} WHERE student_id = $1`, [student.id])).toHaveLength(1);
    } finally {
      await sql!.query('ROLLBACK');
    }
  }, 30000);

  it('one code cannot attach two students under simultaneous accepts', async () => {
    const coach = await user('coach'); const one = await user('student', true); const two = await user('student', true);
    const code = (await issue(coach)).code;
    const results = await Promise.allSettled([attach(one, code), attach(two, code)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db!.query('SELECT id FROM users WHERE coach_id = $1', [coach.id]))).toHaveLength(1);
    expect((await db!.query('SELECT token_hash FROM coach_invitations WHERE coach_id = $1 AND consumed_by IS NOT NULL', [coach.id]))).toHaveLength(1);
  }, 30000);

  it('two coaches cannot both attach one student or consume both invitation codes', async () => {
    const coach1 = await user('coach'); const coach2 = await user('coach');
    for (let i = 0; i < 5; i++) {
      const student = await user('student', true);
      const code1 = (await issue(coach1)).code; const code2 = (await issue(coach2)).code;
      const results = await Promise.allSettled([attach(student, code1), attach(student, code2)]);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
      expect((await db!.query('SELECT token_hash FROM coach_invitations WHERE consumed_by = $1', [student.id]))).toHaveLength(1);
    }
  }, 30000);

  it.each(['program-save', 'program-delete', 'nutrition', 'biometrics', 'chat', 'test-grant'] as const)(
    'rejects a stale %s that waits for withdrawal, including after reconnection to the same coach', async (mode) => {
      const coach = await user('coach'); const student = await user('student', true);
      const connected = await attach(student, (await issue(coach)).code);
      const first = await saveProgramme(db!, student.id, coach.id, programme, { mode: 'new', expectedId: null, expectedVersion: 0 }, now, connected.coachAccessVersion);
      await sql!.query('BEGIN');
      try {
        await withdrawCoachAccess(txDb(), connected, { accountId: student.id });
        const execute = () => {
          if (mode === 'program-save') return saveProgramme(db!, student.id, coach.id, { ...programme, title: 'نباید ذخیره شود' }, { mode: 'edit', expectedId: first.id, expectedVersion: first.version }, now, connected.coachAccessVersion);
          if (mode === 'program-delete') return deleteProgramme(db!, student.id, coach.id, first.id, first.version, connected.coachAccessVersion);
          if (mode === 'nutrition') return savePlan(db!, student.id, coach.id, emptyPlan(), now.toISOString(), connected.coachAccessVersion);
          if (mode === 'biometrics') return saveBiometrics(db!, student.id, coach.id, { limitations: 'نباید ذخیره شود' }, now.toISOString(), connected.coachAccessVersion);
          if (mode === 'chat') return addMessage(db!, coach.id, student.id, coach.id, 'نباید ارسال شود', now.toISOString(), null, null, connected.coachAccessVersion);
          return allowTestPurchase(db!, student.id, { id: first.id, version: first.version }, now, { coachId: coach.id, version: connected.coachAccessVersion, allowRevoked: false });
        };
        const stale = execute().then(() => null, (error: unknown) => error);
        await waitForLock(mode === 'test-grant' ? 'active_program AS MATERIALIZED' : 'relationship AS MATERIALIZED');
        await sql!.query('COMMIT');
        expect(await stale).toMatchObject({ status: 409 });
        const disconnected = (await findUserById(db!, student.id))!;
        await attach(disconnected, (await issue(coach)).code);
        await expect(execute()).rejects.toMatchObject({ status: 409 });
        expect((await db!.query<{ body: string }>('SELECT body FROM student_programs WHERE student_id = $1', [student.id]))[0]!.body).toContain('برنامهٔ قبلی');
        expect(await db!.query('SELECT * FROM nutrition_coach_plans WHERE student_id = $1', [student.id])).toEqual([]);
        expect(await db!.query('SELECT * FROM student_coach_biometrics WHERE student_id = $1', [student.id])).toEqual([]);
        expect(await db!.query('SELECT * FROM messages WHERE student_id = $1', [student.id])).toEqual([]);
      } finally { await sql!.query('ROLLBACK'); }
    }, 30000,
  );

  it('reactivates and edits the same paid offer without accepting old versions after repeated swaps', async () => {
    const coach = await user('coach'); const student = await user('student', true);
    const connected = await attach(student, (await issue(coach)).code);
    const first = await saveProgramme(db!, student.id, coach.id, programme, { mode: 'new', expectedId: null, expectedVersion: 0 }, now, connected.coachAccessVersion);
    await db!.query(`INSERT INTO payment_transactions (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, ref_id, created_at, programme_id, programme_mapping, gateway_mode)
      VALUES ($1, $2, 100000, 90000, 10000, $3, 'paid', 'real-reference', $4, $5, 'explicit', 'live')`, [student.id, coach.id, `paid-${student.id}`, now.toISOString(), first.id]);
    const second = await saveProgramme(db!, student.id, coach.id, { ...programme, title: 'برنامه دوم' }, { mode: 'new', expectedId: first.id, expectedVersion: first.version }, now, connected.coachAccessVersion);
    const archive = await listCoachProgrammes(db!, student.id, coach.id, null);
    const archived = archive.programs.find((item) => item.id === first.id)!;
    const restored = await restoreCoachProgramme(db!, student.id, coach.id, first.id, archived.version, second.id, second.version, now, connected.coachAccessVersion);
    expect(restored.version).toBeGreaterThan(2147483647);
    expect(await isProgramPaid(db!, student.id, first.id)).toBe(true);
    const edited = await saveProgramme(db!, student.id, coach.id, { ...programme, title: 'ویرایش بدون خرید تازه' }, { mode: 'edit', expectedId: restored.id, expectedVersion: restored.version }, now, connected.coachAccessVersion);
    const secondArchived = (await listCoachProgrammes(db!, student.id, coach.id, null)).programs.find((item) => item.id === second.id)!;
    const secondRestored = await restoreCoachProgramme(db!, student.id, coach.id, second.id, secondArchived.version, edited.id, edited.version, now, connected.coachAccessVersion);
    await allowTestPurchase(db!, student.id, { id: secondRestored.id, version: secondRestored.version }, now, { coachId: coach.id, version: connected.coachAccessVersion, allowRevoked: false });
    const checkout = await startTestPurchase(db!, student.id, { id: secondRestored.id, version: secondRestored.version }, now);
    expect((await confirmTestPurchase(db!, student.id, checkout.authority, 'success', now)).success).toBe(true);
    expect((await listTestTransactions(db!, now, coach.id))[0]).toMatchObject({ programmeVersion: secondRestored.version, status: 'paid' });
    const firstAgain = (await listCoachProgrammes(db!, student.id, coach.id, null)).programs.find((item) => item.id === first.id)!;
    const again = await restoreCoachProgramme(db!, student.id, coach.id, first.id, firstAgain.version, secondRestored.id, secondRestored.version, now, connected.coachAccessVersion);
    expect(again.version).toBeGreaterThan(edited.version);
    await expect(saveProgramme(db!, student.id, coach.id, programme, { mode: 'edit', expectedId: first.id, expectedVersion: restored.version }, now, connected.coachAccessVersion)).rejects.toMatchObject({ status: 409 });
    expect(await isProgramPaid(db!, student.id, first.id)).toBe(true);
    expect(await db!.query('SELECT * FROM payment_transactions WHERE student_id = $1', [student.id])).toHaveLength(1);
  }, 30000);

  it('rejects restoring an old offer if withdrawal wins the lock', async () => {
    const coach = await user('coach'); const student = await user('student', true);
    const connected = await attach(student, (await issue(coach)).code);
    const first = await saveProgramme(db!, student.id, coach.id, programme, { mode: 'new', expectedId: null, expectedVersion: 0 }, now, connected.coachAccessVersion);
    const second = await saveProgramme(db!, student.id, coach.id, { ...programme, title: 'برنامه دوم' }, { mode: 'new', expectedId: first.id, expectedVersion: first.version }, now, connected.coachAccessVersion);
    await sql!.query('BEGIN');
    try {
      await withdrawCoachAccess(txDb(), connected, { accountId: student.id });
      const stale = restoreCoachProgramme(db!, student.id, coach.id, first.id, first.version, second.id, second.version, now, connected.coachAccessVersion).then(() => null, (error: unknown) => error);
      await waitForLock('relationship AS MATERIALIZED');
      await sql!.query('COMMIT');
      expect(await stale).toMatchObject({ status: 409 });
      expect((await db!.query<{ programme_id: string }>('SELECT programme_id FROM student_programs WHERE student_id = $1', [student.id]))[0]!.programme_id).toBe(second.id);
    } finally { await sql!.query('ROLLBACK'); }
  }, 30000);

  it('does not create a checkout from a stale offer after personal mode wins the database lock', async () => {
    const coach = await user('coach'); const student = await user('student', true);
    const connected = await attach(student, (await issue(coach)).code);
    const first = await saveProgramme(db!, student.id, coach.id, programme, { mode: 'new', expectedId: null, expectedVersion: 0 }, now, connected.coachAccessVersion);
    await sql!.query('BEGIN');
    try {
      const withdrawn = await withdrawCoachAccess(txDb(), connected, { accountId: student.id });
      await returnToPersonalProgram(txDb(), withdrawn, { accountId: student.id });
      const stale = createPaymentRequest(db!, student.id, 'http://example.test', { id: first.id, version: first.version }, now).then(() => null, (error: unknown) => error);
      await waitForLock('current_offer AS MATERIALIZED');
      await sql!.query('COMMIT');
      expect(await stale).toMatchObject({ status: 409 });
      expect(await db!.query('SELECT * FROM payment_transactions WHERE student_id = $1', [student.id])).toEqual([]);
    } finally { await sql!.query('ROLLBACK'); }
  }, 30000);

  it.each(['personal', 'connect'] as const)('blocks %s when a simultaneous session write commits first', async (action) => {
    const coach = await user('coach'); const student = await user('student', true);
    let candidate = student;
    if (action === 'personal') {
      const connected = await attach(student, (await issue(coach)).code);
      candidate = await withdrawCoachAccess(db!, connected, { accountId: student.id });
    }
    const code = action === 'connect' ? (await issue(coach)).code : '';
    const session = { id: `workout-${student.id}`, templateId: 'personal-day', name: 'تمرین', startedAt: now.toISOString(), status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [] };
    await sql!.query('BEGIN');
    try {
      const written = await applyPersonalChange(txDb(), student.id, { kind: 'session', key: session.id, value: session, baseVersion: 0, operationId: `racing-session-${student.id}`, deleted: false }, now.toISOString());
      expect(written.status).toBe('saved');
      const switching = (action === 'personal'
        ? returnToPersonalProgram(db!, candidate, { accountId: student.id })
        : attach(candidate, code)).then(() => null, (error: unknown) => error);
      await waitForLock(action === 'personal' ? 'personal_program_mode = 1' : 'UPDATE users s SET coach_id');
      await sql!.query('COMMIT');
      expect(await switching).toMatchObject({ status: 409 });
      const fresh = (await findUserById(db!, student.id))!;
      expect(fresh.personalProgramMode).toBe(false);
      if (action === 'connect') {
        expect(fresh.coachId).toBeNull();
        expect(await db!.query('SELECT * FROM coach_invitations WHERE consumed_by = $1', [student.id])).toEqual([]);
      }
    } finally { await sql!.query('ROLLBACK'); }
  }, 30000);

  it('backfills old administrator biometrics once and never copies them to a later coach at restart', async () => {
    const admin = await user('admin'); const a = await user('coach'); const b = await user('coach');
    const student = await user('student', true);
    await db!.query('UPDATE users SET coach_id = $1 WHERE id = $2', [a.id, student.id]);
    await db!.query("INSERT INTO student_biometrics (student_id, coach_id, limitations, updated_at) VALUES ($1, $2, 'خصوصی', $3)", [student.id, admin.id, now.toISOString()]);
    const oldCoachRecord = await user('student', true);
    await db!.query('UPDATE users SET coach_id = $1 WHERE id = $2', [b.id, oldCoachRecord.id]);
    await db!.query("INSERT INTO student_biometrics (student_id, coach_id, limitations, updated_at) VALUES ($1, $2, 'سابقهٔ مربی قبلی', $3)", [oldCoachRecord.id, a.id, now.toISOString()]);
    await db!.query("DELETE FROM app_data_migrations WHERE name = 'coach-biometrics-v1'");
    await migrateBiometrics(db!);
    expect((await loadBiometrics(db!, student.id, a.id)).limitations).toBe('خصوصی');
    expect((await loadBiometrics(db!, oldCoachRecord.id, a.id)).limitations).toBe('سابقهٔ مربی قبلی');
    expect((await loadBiometrics(db!, oldCoachRecord.id, b.id)).limitations).toBe('');
    await db!.query('UPDATE users SET coach_id = $1 WHERE id = $2', [b.id, student.id]);
    await migrateBiometrics(db!);
    expect((await loadBiometrics(db!, student.id, b.id)).limitations).toBe('');
    expect((await loadBiometrics(db!, student.id, a.id)).limitations).toBe('خصوصی');
  }, 30000);

  it.each(['save', 'toggle'] as const)('does not restore profile consent when stale %s waits for withdrawal', async (mode) => {
    const coach = await user('coach'); const student = await user('student', true);
    const attached = await attach(student, (await issue(coach)).code);
    await saveStudentProfile(db!, student.id, profile, true, now.toISOString(), attached.coachAccessVersion);
    const txDb: Db = {
      query: async <T extends Record<string, any>>(statement: string, params: unknown[] = []) => (await sql!.query(statement, params)).rows as T[],
      exec: async (statement) => { await sql!.query(statement); }, close: async () => {},
    };
    await sql!.query('BEGIN');
    try {
      await withdrawCoachAccess(txDb, attached, { accountId: student.id });
      const stale = (mode === 'save'
        ? saveStudentProfile(db!, student.id, profile, true, now.toISOString(), attached.coachAccessVersion)
        : setStudentProfileSharing(db!, student.id, true, now.toISOString(), attached.coachAccessVersion))
        .then(() => null, (error: unknown) => error);
      await waitForLock('coach_access_version');
      await sql!.query('COMMIT');
      expect(await stale).toMatchObject({ status: 409 });
      const revoked = (await findUserById(db!, student.id))!;
      expect(revoked.coachAccess).toBe(false);
      await attach(revoked, (await issue(coach)).code);
      const stored = await db!.query<{ share_with_coach: number }>('SELECT share_with_coach FROM student_profiles WHERE student_id = $1', [student.id]);
      expect(Number(stored[0]!.share_with_coach)).toBe(0);
      expect((await findUserById(db!, student.id))!.coachAccessVersion).toBe(attached.coachAccessVersion + 2);
    } finally { await sql!.query('ROLLBACK'); }
  }, 30000);
});
