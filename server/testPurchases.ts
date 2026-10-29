import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';
import { calculateCommission, type PaymentTransaction } from './payments.ts';

const TEST_ACCESS_HOURS = 24;
type TestStatus = 'allowed' | 'pending' | 'paid' | 'canceled';

interface TestPurchaseRow {
  programme_id: string;
  expires_at: string;
  status: TestStatus;
  authority: string | null;
  checkout_version: number | null;
  amount_tomans: number | null;
  mode_token: string | null;
}

interface TestTransactionRow {
  id: number;
  student_id: number;
  student_name: string;
  coach_id: number;
  coach_name: string;
  programme_id: string;
  programme_version: number;
  amount_tomans: number;
  coach_share_tomans: number;
  admin_share_tomans: number;
  authority: string;
  status: 'pending' | 'paid' | 'canceled';
  created_at: string;
  expires_at: string;
  verified_at: string | null;
  grant_status: TestStatus | null;
  grant_mode_token: string | null;
  current_mode_token: string | null;
  mode_expires_at: string | null;
  active_programme_id: string | null;
  active_programme_version: number | null;
  active_price_tomans: number | null;
}

export interface TestMode {
  available: boolean;
  enabled: boolean;
  expiresAt: string | null;
}

export interface TestTransaction extends PaymentTransaction {
  simulation: true;
  programmeId: string;
  programmeVersion: number;
}

/** Test authorizations and financial records are isolated from real payments. */
export async function migrateTestPurchases(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payment_test_purchases (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      programme_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('allowed', 'pending', 'paid', 'canceled')),
      authority TEXT UNIQUE,
      checkout_version BIGINT,
      amount_tomans INTEGER
    );
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'payment_test_purchases' AND column_name = 'checkout_version' AND data_type <> 'bigint') THEN
        ALTER TABLE payment_test_purchases ALTER COLUMN checkout_version TYPE BIGINT;
      END IF;
    END $$;
    -- NULL means an individual coach grant; a token belongs to one global test session.
    ALTER TABLE payment_test_purchases ADD COLUMN IF NOT EXISTS mode_token TEXT;
    CREATE TABLE IF NOT EXISTS payment_test_mode (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT,
      expires_at TEXT,
      activated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
    );
    INSERT INTO payment_test_mode (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS payment_test_transactions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      coach_id INTEGER NOT NULL REFERENCES users(id),
      programme_id TEXT NOT NULL,
      programme_version BIGINT NOT NULL,
      amount_tomans INTEGER NOT NULL CHECK (amount_tomans > 0),
      coach_share_tomans INTEGER NOT NULL CHECK (coach_share_tomans >= 0),
      admin_share_tomans INTEGER NOT NULL CHECK (admin_share_tomans >= 0),
      authority TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'canceled')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      CHECK (coach_share_tomans + admin_share_tomans = amount_tomans)
    );
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'payment_test_transactions' AND column_name = 'programme_version' AND data_type <> 'bigint') THEN
        ALTER TABLE payment_test_transactions ALTER COLUMN programme_version TYPE BIGINT;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_test_payment_coach ON payment_test_transactions(coach_id, id);
    CREATE INDEX IF NOT EXISTS idx_test_payment_student ON payment_test_transactions(student_id, status);
  `);
  // Do not revive test access if a merchant or kill switch is later removed. Keep labeled history.
  if (!studentTestPurchasesAvailable()) {
    await db.query('DELETE FROM payment_test_purchases');
    await db.query('UPDATE payment_test_mode SET token = NULL, expires_at = NULL, activated_by = NULL WHERE id = 1');
  }
}

/** A real merchant, even if partly configured, always disables this separate test flow. */
export function studentTestPurchasesAvailable(): boolean {
  const switchValue = process.env.STUDENT_TEST_PURCHASES?.trim().toLowerCase();
  return !['off', 'false', '0'].includes(switchValue ?? '') && !process.env.ZARINPAL_MERCHANT_ID?.trim();
}

function assertTestAvailable(): void {
  if (!studentTestPurchasesAvailable()) throw new HttpError(503, 'خرید آزمایشی در حال حاضر در دسترس نیست.');
}

export async function getTestMode(db: Db, now: Date): Promise<TestMode> {
  if (!studentTestPurchasesAvailable()) return { available: false, enabled: false, expiresAt: null };
  const rows = await db.query<{ expires_at: string | null }>(
    'SELECT expires_at FROM payment_test_mode WHERE id = 1 AND token IS NOT NULL AND expires_at > $1', [now.toISOString()],
  );
  return { available: true, enabled: !!rows[0], expiresAt: rows[0]?.expires_at ?? null };
}

/** An admin's explicit global authorization expires after 24 hours and never revives old sessions. */
export async function setTestMode(db: Db, adminId: number, enabled: boolean, now: Date): Promise<TestMode> {
  if (enabled) assertTestAvailable();
  const token = enabled ? randomUUID() : null;
  const expiresAt = enabled ? new Date(now.getTime() + TEST_ACCESS_HOURS * 60 * 60 * 1000).toISOString() : null;
  const changed = await db.query<{ token: string | null; expires_at: string | null }>(`
    WITH changed AS (
      UPDATE payment_test_mode SET token = $1, expires_at = $2, activated_by = $3 WHERE id = 1 RETURNING token, expires_at
    ), cancel_pending AS (
      UPDATE payment_test_transactions AS t SET status = 'canceled', verified_at = $4
      WHERE EXISTS (SELECT 1 FROM changed) AND t.status = 'pending' AND t.authority IN (
        SELECT p.authority FROM payment_test_purchases p
        WHERE p.mode_token IS NOT NULL AND p.mode_token IS DISTINCT FROM $1
      )
    )
    SELECT token, expires_at FROM changed
  `, [token, expiresAt, enabled ? adminId : null, now.toISOString()]);
  if (!changed[0]) throw new HttpError(503, 'وضعیت آزمایش در پایگاه داده پیدا نشد.');
  return { available: studentTestPurchasesAvailable(), enabled: changed[0].token !== null, expiresAt: changed[0].expires_at };
}

export async function testPurchaseState(db: Db, studentId: number, programmeId: string, now: Date): Promise<TestPurchaseRow | null> {
  if (!studentTestPurchasesAvailable()) return null;
  const rows = await db.query<TestPurchaseRow>(`
    SELECT p.programme_id, p.expires_at, p.status, p.authority, p.checkout_version, p.amount_tomans, p.mode_token
    FROM payment_test_purchases p CROSS JOIN payment_test_mode m
    WHERE p.student_id = $1 AND p.programme_id = $2 AND p.expires_at > $3 AND m.id = 1
      AND (p.mode_token IS NULL OR (p.mode_token = m.token AND m.expires_at > $3))
  `, [studentId, programmeId, now.toISOString()]);
  return rows[0] ?? null;
}

/** The assigned coach/admin may still authorize just one student without enabling global mode. */
export async function allowTestPurchase(db: Db, studentId: number, expected: { id: string; version: number }, now: Date, relationship?: { coachId: number; version: number; allowRevoked: boolean }): Promise<string> {
  assertTestAvailable();
  const expiresAt = new Date(now.getTime() + TEST_ACCESS_HOURS * 60 * 60 * 1000).toISOString();
  const rows = await db.query<{ expires_at: string }>(`
    WITH active_program AS MATERIALIZED (
      SELECT sp.student_id, sp.programme_id FROM users u JOIN student_programs sp ON sp.student_id = u.id
      WHERE sp.student_id = $1 AND sp.programme_id = $2 AND sp.version = $3 AND COALESCE(sp.price_tomans, 0) > 0
        AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0
        AND ($6::integer IS NULL OR (u.coach_id = $6 AND u.coach_access_version = $7 AND (u.coach_access = 1 OR $8::boolean)))
      FOR UPDATE OF u, sp
    ), grant_access AS (
      INSERT INTO payment_test_purchases (student_id, programme_id, expires_at, status, mode_token)
      SELECT sp.student_id, sp.programme_id, $4, 'allowed', NULL FROM active_program sp
      ON CONFLICT (student_id) DO UPDATE SET programme_id = excluded.programme_id, expires_at = excluded.expires_at,
        status = 'allowed', authority = NULL, checkout_version = NULL, amount_tomans = NULL, mode_token = NULL
      RETURNING expires_at
    ), cancel_pending AS (
      UPDATE payment_test_transactions SET status = 'canceled', verified_at = $5
      WHERE student_id = $1 AND status = 'pending' AND EXISTS (SELECT 1 FROM grant_access)
    )
    SELECT expires_at FROM grant_access
  `, [studentId, expected.id, expected.version, expiresAt, now.toISOString(), relationship?.coachId ?? null, relationship?.version ?? null, relationship?.allowRevoked ?? false]);
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده یا رایگان است؛ صفحه را دوباره بارگذاری کنید.');
  return rows[0].expires_at;
}

export async function revokeTestPurchase(db: Db, studentId: number, programmeId: string, now: Date, relationship?: { coachId: number; version: number; allowRevoked: boolean }): Promise<void> {
  const rows = await db.query(`
    WITH relationship AS MATERIALIZED (
      SELECT u.id FROM users u JOIN student_programs sp ON sp.student_id = u.id
      WHERE u.id = $1 AND sp.programme_id = $2 AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0
        AND ($4::integer IS NULL OR (u.coach_id = $4 AND u.coach_access_version = $5 AND (u.coach_access = 1 OR $6::boolean)))
      FOR UPDATE OF u, sp
    ), revoked AS (
      DELETE FROM payment_test_purchases WHERE student_id = $1 AND programme_id = $2 AND EXISTS (SELECT 1 FROM relationship) RETURNING authority
    ), canceled AS (
      UPDATE payment_test_transactions SET status = 'canceled', verified_at = $3
      WHERE student_id = $1 AND status = 'pending' AND authority IN (SELECT authority FROM revoked)
    ) SELECT id FROM relationship
  `, [studentId, programmeId, now.toISOString(), relationship?.coachId ?? null, relationship?.version ?? null, relationship?.allowRevoked ?? false]);
  if (!rows.length) throw new HttpError(409, 'برنامه یا دسترسی مربی تغییر کرده است؛ صفحه را دوباره باز کنید.');
}

/** A global session creates an authorization lazily, without overwriting a live individual grant. */
async function ensureGlobalGrant(db: Db, studentId: number, expected: { id: string; version: number }, now: Date): Promise<void> {
  await db.query(`
    WITH active_mode AS (
      SELECT token, expires_at FROM payment_test_mode
      WHERE id = 1 AND token IS NOT NULL AND expires_at > $4 FOR SHARE
    ), active_program AS (
      SELECT sp.student_id, sp.programme_id FROM student_programs sp JOIN users u ON u.id = sp.student_id
      WHERE sp.student_id = $1 AND sp.programme_id = $2 AND sp.version = $3 AND COALESCE(sp.price_tomans, 0) > 0
        AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0 FOR UPDATE OF u, sp
    )
    INSERT INTO payment_test_purchases AS p (student_id, programme_id, expires_at, status, mode_token)
    SELECT sp.student_id, sp.programme_id, m.expires_at, 'allowed', m.token FROM active_program sp CROSS JOIN active_mode m
    ON CONFLICT (student_id) DO UPDATE SET programme_id = excluded.programme_id, expires_at = excluded.expires_at,
      status = 'allowed', authority = NULL, checkout_version = NULL, amount_tomans = NULL, mode_token = excluded.mode_token
    WHERE p.programme_id <> excluded.programme_id OR p.expires_at <= $4
      OR (p.mode_token IS NOT NULL AND p.mode_token <> excluded.mode_token)
  `, [studentId, expected.id, expected.version, now.toISOString()]);
}

/** Repeated starts reuse a pending checkout and atomically add a separate financial record. */
export async function startTestPurchase(db: Db, studentId: number, expected: { id: string; version: number }, now: Date): Promise<{ authority: string; amountTomans: number; expiresAt: string }> {
  assertTestAvailable();
  const program = (await db.query<{ price_tomans: number; coach_id: number }>(`
    SELECT sp.price_tomans, u.coach_id FROM student_programs sp JOIN users u ON u.id = sp.student_id
    WHERE sp.student_id = $1 AND sp.programme_id = $2 AND sp.version = $3 AND COALESCE(sp.price_tomans, 0) > 0
      AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0
  `, [studentId, expected.id, expected.version]))[0];
  if (!program) throw new HttpError(409, 'برنامه تغییر کرده یا رایگان است؛ صفحه را دوباره بارگذاری کنید.');
  const { coachShare, adminShare } = calculateCommission(program.price_tomans);
  await ensureGlobalGrant(db, studentId, expected, now);
  const candidate = `TEST-${randomUUID()}`;
  const rows = await db.query<{ authority: string; amount_tomans: number; expires_at: string }>(`
    WITH active_program AS (
      SELECT sp.student_id, u.coach_id, sp.programme_id, sp.version, sp.price_tomans
      FROM student_programs sp JOIN users u ON u.id = sp.student_id
      WHERE sp.student_id = $1 AND sp.programme_id = $2 AND sp.version = $3
        AND sp.price_tomans = $6 AND u.coach_id = $9 AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0 FOR UPDATE OF sp, u
    ), mode AS (
      SELECT token, expires_at FROM payment_test_mode WHERE id = 1 FOR SHARE
    ), checkout AS (
      UPDATE payment_test_purchases AS test SET
        authority = CASE WHEN test.status = 'pending' AND test.authority IS NOT NULL AND test.checkout_version = sp.version
          AND test.amount_tomans = sp.price_tomans THEN test.authority ELSE $5 END,
        checkout_version = sp.version, amount_tomans = sp.price_tomans, status = 'pending'
      FROM active_program sp CROSS JOIN mode m
      WHERE test.student_id = $1 AND sp.student_id = test.student_id AND test.programme_id = $2
        AND test.expires_at > $4 AND test.status <> 'paid'
        AND (test.mode_token IS NULL OR (test.mode_token = m.token AND m.expires_at > $4))
      RETURNING test.authority, test.amount_tomans, test.expires_at, sp.coach_id, sp.programme_id, sp.version
    ), cancel_previous AS (
      UPDATE payment_test_transactions AS t SET status = 'canceled', verified_at = $4
      FROM checkout c WHERE t.student_id = $1 AND t.status = 'pending' AND t.authority <> c.authority
    ), record_checkout AS (
      INSERT INTO payment_test_transactions
        (student_id, coach_id, programme_id, programme_version, amount_tomans, coach_share_tomans,
         admin_share_tomans, authority, status, created_at, expires_at)
      SELECT $1, c.coach_id, c.programme_id, c.version, c.amount_tomans, $7, $8, c.authority, 'pending', $4, c.expires_at FROM checkout c
      ON CONFLICT (authority) DO NOTHING
    )
    SELECT authority, amount_tomans, expires_at FROM checkout
  `, [studentId, expected.id, expected.version, now.toISOString(), candidate, program.price_tomans, coachShare, adminShare, program.coach_id]);
  if (!rows[0]) throw new HttpError(409, 'اجازهٔ آزمایش وجود ندارد یا برنامه تغییر کرده است؛ صفحه را تازه کنید.');
  return { authority: rows[0].authority, amountTomans: rows[0].amount_tomans, expiresAt: rows[0].expires_at };
}

/** The access and financial status change together; neither can unlock a different programme. */
export async function confirmTestPurchase(db: Db, studentId: number, authority: string, result: 'success' | 'cancel', now: Date): Promise<{ success: boolean; expiresAt: string; amountTomans: number }> {
  assertTestAvailable();
  const next = result === 'success' ? 'paid' : 'canceled';
  const run = () => db.query<{ status: TestStatus; expires_at: string; amount_tomans: number }>(`
    WITH active_program AS (
      SELECT student_id, programme_id, version, price_tomans FROM student_programs WHERE student_id = $1 FOR UPDATE
    ), mode AS (
      SELECT token, expires_at FROM payment_test_mode WHERE id = 1 FOR SHARE
    ), access_lock AS (
      SELECT p.student_id, p.authority FROM payment_test_purchases p
      JOIN active_program sp ON sp.student_id = p.student_id AND sp.programme_id = p.programme_id
      CROSS JOIN mode m
      WHERE p.student_id = $1 AND p.authority = $2 AND p.expires_at > $3
        AND (p.mode_token IS NULL OR (p.mode_token = m.token AND m.expires_at > $3))
      FOR UPDATE OF p
    ), ledger AS (
      SELECT t.authority, t.programme_id, t.amount_tomans, t.status FROM payment_test_transactions t
      JOIN access_lock a ON a.student_id = t.student_id AND a.authority = t.authority FOR UPDATE OF t
    ), updated_access AS (
      UPDATE payment_test_purchases AS test SET status = CASE WHEN test.status = 'pending' THEN $4 ELSE test.status END
      FROM active_program sp CROSS JOIN ledger l
      WHERE test.student_id = $1 AND test.authority = $2 AND test.expires_at > $3
        AND sp.student_id = test.student_id AND sp.programme_id = test.programme_id
        AND l.programme_id = test.programme_id AND l.amount_tomans = test.amount_tomans AND l.status = test.status
        AND (test.status IN ('paid', 'canceled') OR
          (test.status = 'pending' AND sp.version = test.checkout_version AND sp.price_tomans = test.amount_tomans))
      RETURNING test.status, test.expires_at, test.amount_tomans
    ), updated_ledger AS (
      UPDATE payment_test_transactions AS t SET status = a.status,
        verified_at = CASE WHEN t.status = 'pending' THEN $3 ELSE t.verified_at END
      FROM updated_access a WHERE t.student_id = $1 AND t.authority = $2
    )
    SELECT status, expires_at, amount_tomans FROM updated_access
  `, [studentId, authority, now.toISOString(), next]);
  // A concurrent confirmation can make the first READ COMMITTED snapshot stale while it waits.
  // A fresh statement observes the winning result; truly expired or invalid checkouts still fail.
  let rows = await run();
  if (!rows[0]) rows = await run();
  if (!rows[0]) throw new HttpError(409, 'خرید آزمایشی منقضی شده یا برنامه تغییر کرده است؛ دوباره آزمایش را شروع کنید.');
  return { success: rows[0].status === 'paid', expiresAt: rows[0].expires_at, amountTomans: rows[0].amount_tomans };
}

export async function listTestTransactions(db: Db, now: Date, coachId?: number): Promise<TestTransaction[]> {
  const rows = await db.query<TestTransactionRow>(`
    SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name,
      p.status AS grant_status, p.mode_token AS grant_mode_token, m.token AS current_mode_token,
      m.expires_at AS mode_expires_at, sp.programme_id AS active_programme_id,
      sp.version AS active_programme_version, sp.price_tomans AS active_price_tomans
    FROM payment_test_transactions t JOIN users s ON s.id = t.student_id JOIN users c ON c.id = t.coach_id
    LEFT JOIN payment_test_purchases p ON p.student_id = t.student_id AND p.authority = t.authority
    LEFT JOIN payment_test_mode m ON m.id = 1 LEFT JOIN student_programs sp ON sp.student_id = t.student_id
    ${coachId === undefined ? '' : 'WHERE t.coach_id = $1'} ORDER BY t.id DESC
  `, coachId === undefined ? [] : [coachId]);
  const instant = now.toISOString();
  return rows.map((row) => {
    // A pending checkout that can no longer be confirmed is shown as ended, without inventing a verification time.
    const expired = row.status === 'pending' && (!studentTestPurchasesAvailable() || row.expires_at <= instant ||
      row.grant_status !== 'pending' || row.active_programme_id !== row.programme_id ||
      Number(row.active_programme_version) !== Number(row.programme_version) || row.active_price_tomans !== row.amount_tomans ||
      (row.grant_mode_token !== null && (row.grant_mode_token !== row.current_mode_token || !row.mode_expires_at || row.mode_expires_at <= instant)));
    return {
      id: row.id, studentId: row.student_id, studentName: row.student_name,
      coachId: row.coach_id, coachName: row.coach_name,
      programmeId: row.programme_id, programmeVersion: Number(row.programme_version),
      amountTomans: row.amount_tomans, coachShareTomans: row.coach_share_tomans,
      adminShareTomans: row.admin_share_tomans, authority: row.authority,
      status: expired ? 'expired' : row.status,
      refId: null, cardPan: null, createdAt: row.created_at, verifiedAt: row.verified_at, simulation: true as const,
    };
  });
}
