// @vitest-environment node
// Optional integration: use only a disposable PostgreSQL database with CREATE SCHEMA permission.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acceptCoachInvitation, makeCoachInvitation, withdrawCoachAccess } from './coachInvites.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { findUserById, insertUser, type Role, type StoredUser } from './users.ts';
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

  it('one code cannot attach two students under simultaneous accepts', async () => {
    const coach = await user('coach'); const one = await user('student', true); const two = await user('student', true);
    const code = (await issue(coach)).code;
    const results = await Promise.allSettled([attach(one, code), attach(two, code)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await db!.query('SELECT id FROM users WHERE coach_id = $1', [coach.id]))).toHaveLength(1);
    expect((await db!.query('SELECT token_hash FROM coach_invitations WHERE consumed_by IS NOT NULL'))).toHaveLength(1);
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
      expect((await findUserById(db!, student.id))!.coachAccessVersion).toBe(attached.coachAccessVersion + 1);
    } finally { await sql!.query('ROLLBACK'); }
  }, 30000);
});
