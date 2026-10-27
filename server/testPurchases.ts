import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';

const TEST_ACCESS_HOURS = 24;
type TestStatus = 'allowed' | 'pending' | 'paid' | 'canceled';

interface TestPurchaseRow {
  programme_id: string;
  expires_at: string;
  status: TestStatus;
  authority: string | null;
  checkout_version: number | null;
  amount_tomans: number | null;
}

/** Test purchases are never stored in the real payment ledger. */
export async function migrateTestPurchases(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payment_test_purchases (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      programme_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('allowed', 'pending', 'paid', 'canceled')),
      authority TEXT UNIQUE,
      checkout_version INTEGER,
      amount_tomans INTEGER
    );
  `);
  // Once a real merchant is configured, do not revive old grants if it is later removed.
  if (!studentTestPurchasesAvailable()) await db.query('DELETE FROM payment_test_purchases');
}

/** A real merchant, even if partly configured, always disables this separate test flow. */
export function studentTestPurchasesAvailable(): boolean {
  const switchValue = process.env.STUDENT_TEST_PURCHASES?.trim().toLowerCase();
  return !['off', 'false', '0'].includes(switchValue ?? '') && !process.env.ZARINPAL_MERCHANT_ID?.trim();
}

function assertTestAvailable(): void {
  if (!studentTestPurchasesAvailable()) throw new HttpError(503, 'خرید آزمایشی در حال حاضر در دسترس نیست.');
}

export async function testPurchaseState(db: Db, studentId: number, programmeId: string, now: Date): Promise<TestPurchaseRow | null> {
  if (!studentTestPurchasesAvailable()) return null;
  const rows = await db.query<TestPurchaseRow>(
    'SELECT programme_id, expires_at, status, authority, checkout_version, amount_tomans FROM payment_test_purchases WHERE student_id = $1 AND programme_id = $2 AND expires_at > $3',
    [studentId, programmeId, now.toISOString()],
  );
  return rows[0] ?? null;
}

/** Only the assigned coach/admin can enable the current paid programme, for at most 24 hours. */
export async function allowTestPurchase(db: Db, studentId: number, expected: { id: string; version: number }, now: Date): Promise<string> {
  assertTestAvailable();
  const expiresAt = new Date(now.getTime() + TEST_ACCESS_HOURS * 60 * 60 * 1000).toISOString();
  const rows = await db.query<{ expires_at: string }>(`
    WITH active_program AS (
      SELECT student_id, programme_id FROM student_programs
      WHERE student_id = $1 AND programme_id = $2 AND version = $3 AND COALESCE(price_tomans, 0) > 0 FOR UPDATE
    )
    INSERT INTO payment_test_purchases (student_id, programme_id, expires_at, status)
    SELECT sp.student_id, sp.programme_id, $4, 'allowed' FROM active_program sp
    ON CONFLICT (student_id) DO UPDATE SET programme_id = excluded.programme_id, expires_at = excluded.expires_at,
      status = 'allowed', authority = NULL, checkout_version = NULL, amount_tomans = NULL
    RETURNING expires_at
  `, [studentId, expected.id, expected.version, expiresAt]);
  if (!rows[0]) throw new HttpError(409, 'برنامه تغییر کرده یا رایگان است؛ صفحه را دوباره بارگذاری کنید.');
  return rows[0].expires_at;
}

export async function revokeTestPurchase(db: Db, studentId: number, programmeId: string): Promise<void> {
  await db.query('DELETE FROM payment_test_purchases WHERE student_id = $1 AND programme_id = $2', [studentId, programmeId]);
}

/** Repeated starts for the same version reuse the pending test checkout. */
export async function startTestPurchase(db: Db, studentId: number, expected: { id: string; version: number }, now: Date): Promise<{ authority: string; amountTomans: number; expiresAt: string }> {
  assertTestAvailable();
  const candidate = `TEST-${randomUUID()}`;
  const rows = await db.query<{ authority: string; amount_tomans: number; expires_at: string }>(`
    WITH active_program AS (
      SELECT student_id, programme_id, version, price_tomans FROM student_programs
      WHERE student_id = $1 AND programme_id = $2 AND version = $3 AND COALESCE(price_tomans, 0) > 0 FOR UPDATE
    )
    UPDATE payment_test_purchases AS test SET
      authority = CASE WHEN test.status = 'pending' AND test.checkout_version = sp.version
        AND test.amount_tomans = sp.price_tomans THEN test.authority ELSE $5 END,
      checkout_version = sp.version, amount_tomans = sp.price_tomans, status = 'pending'
    FROM active_program sp
    WHERE test.student_id = $1 AND sp.student_id = test.student_id AND test.programme_id = $2
      AND test.expires_at > $4 AND test.status <> 'paid'
    RETURNING test.authority, test.amount_tomans, test.expires_at
  `, [studentId, expected.id, expected.version, now.toISOString(), candidate]);
  if (!rows[0]) throw new HttpError(409, 'اجازهٔ آزمایش وجود ندارد یا برنامه تغییر کرده است؛ با مربی هماهنگ و صفحه را تازه کنید.');
  return { authority: rows[0].authority, amountTomans: rows[0].amount_tomans, expiresAt: rows[0].expires_at };
}

/** Confirmation changes only the isolated test row, and cannot unlock another programme. */
export async function confirmTestPurchase(db: Db, studentId: number, authority: string, result: 'success' | 'cancel', now: Date): Promise<{ success: boolean; expiresAt: string; amountTomans: number }> {
  assertTestAvailable();
  const next = result === 'success' ? 'paid' : 'canceled';
  const rows = await db.query<{ status: TestStatus; expires_at: string; amount_tomans: number }>(`
    WITH active_program AS (
      SELECT student_id, programme_id, version, price_tomans FROM student_programs WHERE student_id = $1 FOR UPDATE
    )
    UPDATE payment_test_purchases AS test SET status = CASE WHEN test.status = 'pending' THEN $4 ELSE test.status END
    FROM active_program sp
    WHERE test.student_id = $1 AND test.authority = $2 AND test.expires_at > $3
      AND sp.student_id = test.student_id AND sp.programme_id = test.programme_id
      AND (test.status IN ('paid', 'canceled') OR
        (test.status = 'pending' AND sp.version = test.checkout_version AND sp.price_tomans = test.amount_tomans))
    RETURNING test.status, test.expires_at, test.amount_tomans
  `, [studentId, authority, now.toISOString(), next]);
  if (!rows[0]) throw new HttpError(409, 'خرید آزمایشی منقضی شده یا برنامه تغییر کرده است؛ دوباره آزمایش را شروع کنید.');
  return { success: rows[0].status === 'paid', expiresAt: rows[0].expires_at, amountTomans: rows[0].amount_tomans };
}
