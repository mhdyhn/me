import type { Db } from './db.ts';
import { HttpError } from './http.ts';

export interface PaymentTransaction {
  id: number;
  studentId: number;
  studentName?: string;
  coachId: number;
  coachName?: string;
  amountTomans: number;
  coachShareTomans: number;
  adminShareTomans: number;
  authority: string;
  status: 'pending' | 'paid' | 'failed' | 'canceled' | 'expired';
  refId: string | null;
  cardPan: string | null;
  createdAt: string;
  verifiedAt: string | null;
  /** How the money was (or will be) paid. */
  method: 'online' | 'card_transfer' | 'sandbox' | 'legacy';
  /** The exact amount a card transfer has to use. */
  cardTransferAmountTomans?: number | null;
  /** Short reference the student wrote into the transfer description. */
  cardTransferReference?: string | null;
  /** Last four digits of the sending card, as declared by the student. */
  cardTransferSenderLast4?: string | null;
  /** `auto` for the automatic receipt check, `manual` for a support decision. */
  cardTransferConfirmedBy?: string | null;
}

interface TransactionRow {
  id: number;
  student_id: number;
  student_name?: string;
  coach_id: number;
  coach_name?: string;
  amount_tomans: number;
  coach_share_tomans: number;
  admin_share_tomans: number;
  authority: string;
  status: string;
  ref_id: string | null;
  card_pan: string | null;
  created_at: string;
  verified_at: string | null;
  gateway_mode: 'sandbox' | 'live' | 'legacy' | 'card_transfer';
  programme_id: string | null;
  programme_mapping: string;
  card_transfer_amount_tomans?: number | null;
  card_transfer_reference?: string | null;
  card_transfer_sender_last4?: string | null;
  card_transfer_confirmed_by?: string | null;
}

export async function migratePayments(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      coach_id INTEGER NOT NULL REFERENCES users(id),
      amount_tomans INTEGER NOT NULL,
      coach_share_tomans INTEGER NOT NULL,
      admin_share_tomans INTEGER NOT NULL,
      authority TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      ref_id TEXT,
      card_pan TEXT,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      gateway_mode TEXT NOT NULL DEFAULT 'legacy'
    );

    CREATE INDEX IF NOT EXISTS idx_payment_student ON payment_transactions(student_id, status);
    CREATE INDEX IF NOT EXISTS idx_payment_coach ON payment_transactions(coach_id);
    CREATE INDEX IF NOT EXISTS idx_payment_authority ON payment_transactions(authority);

    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS gateway_mode TEXT NOT NULL DEFAULT 'legacy';
    ALTER TABLE student_programs ADD COLUMN IF NOT EXISTS price_tomans INTEGER DEFAULT 0;
    ALTER TABLE student_programs ADD COLUMN IF NOT EXISTS programme_id TEXT;
    ALTER TABLE student_programs ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'student_programs' AND column_name = 'version' AND data_type <> 'bigint') THEN
        ALTER TABLE student_programs ALTER COLUMN version TYPE BIGINT;
      END IF;
    END $$;
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS programme_id TEXT;
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS programme_mapping TEXT NOT NULL DEFAULT 'legacy_unmapped';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS iban TEXT;

    -- The active row remains compatible with existing data; offers retain earlier programmes.
    CREATE TABLE IF NOT EXISTS programme_offers (
      id TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      body TEXT NOT NULL,
      price_tomans INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version BIGINT NOT NULL DEFAULT 1
    );
    ALTER TABLE programme_offers ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'programme_offers' AND column_name = 'version' AND data_type <> 'bigint') THEN
        ALTER TABLE programme_offers ALTER COLUMN version TYPE BIGINT;
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS idx_programme_offers_student ON programme_offers(student_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_payment_programme ON payment_transactions(student_id, programme_id, status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_one_pending_explicit
      ON payment_transactions(student_id, programme_id)
      WHERE status = 'pending' AND programme_mapping = 'explicit' AND programme_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS app_data_migrations (name TEXT PRIMARY KEY);

    UPDATE student_programs SET programme_id = 'legacy-' || student_id::text WHERE programme_id IS NULL;
    INSERT INTO programme_offers (id, student_id, coach_id, body, price_tomans, created_at, updated_at)
    SELECT programme_id, student_id, coach_id, body, COALESCE(price_tomans, 0), updated_at, updated_at
    FROM student_programs WHERE programme_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
    UPDATE programme_offers AS o SET version = sp.version FROM student_programs AS sp
      WHERE o.id = sp.programme_id AND o.student_id = sp.student_id AND o.version < sp.version;
  `);
  // Old payments had no programme identity. Preserve the access they already gave to the
  // currently active programme. Only clearly attributable pending checkouts are attached.
  // The marker and mapping are one atomic statement so later programmes are never backfilled.
  await db.query(`
    WITH migration AS (
      INSERT INTO app_data_migrations(name) VALUES ('programme-payment-identity-v1')
      ON CONFLICT DO NOTHING RETURNING name
    )
    UPDATE payment_transactions AS t
    SET programme_id = sp.programme_id, programme_mapping = 'legacy_current'
    FROM student_programs AS sp
    WHERE EXISTS (SELECT 1 FROM migration) AND t.programme_id IS NULL
      AND t.student_id = sp.student_id
      AND (t.status = 'paid' OR (t.status = 'pending' AND t.created_at >= sp.updated_at
           AND t.amount_tomans = COALESCE(sp.price_tomans, 0) AND t.coach_id = sp.coach_id))
  `);
}

/**
 * Calculates 90% coach and 10% admin shares (configurable via environment variables).
 * Uses Math.floor on coach share and allocates remainder to admin so sum is always exactly 100%.
 */
export function calculateCommission(amountTomans: number): { coachShare: number; adminShare: number } {
  const configuredPercent = process.env.COACH_COMMISSION_PERCENT;
  const coachPercent = configuredPercent === undefined ? 90 : Number(configuredPercent);
  if (configuredPercent?.trim() === '' || !Number.isFinite(coachPercent) || coachPercent < 0 || coachPercent > 100) {
    throw new HttpError(503, 'درصد سهم مربی در سرور نامعتبر است.');
  }
  const coachShare = Math.floor((amountTomans * coachPercent) / 100);
  const adminShare = amountTomans - coachShare;
  return { coachShare, adminShare };
}

/** Validates Iranian IBAN (Sheba): IR followed by 24 digits. */
export function normalizeIban(raw: string): string {
  const cleaned = raw.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  }).replace(/\s+/g, '').toUpperCase();
  if (!/^IR\d{24}$/.test(cleaned)) {
    throw new HttpError(400, 'شماره شبا نامعتبر است. شماره شبا باید با IR و ۲۴ رقم ادامه یابد.');
  }
  return cleaned;
}

/** Shared by the active programme and archive; test payments never unlock live data. */
export function paidTransactionCondition(alias: 't', productionParam: '$2' | '$3' | '$10'): string {
  return `${alias}.status = 'paid' AND (${productionParam} = 0 OR (${alias}.gateway_mode <> 'sandbox' AND ${alias}.ref_id IS NOT NULL AND TRIM(${alias}.ref_id) <> '' AND LOWER(TRIM(${alias}.ref_id)) NOT IN ('undefined', 'null') AND UPPER(TRIM(${alias}.ref_id)) NOT LIKE 'SANDBOX-%'))`;
}

/** A verified payment grants exactly the programme recorded on that transaction. */
export async function isProgramPaid(db: Db, studentId: number, programmeId: string): Promise<boolean> {
  const rows = await db.query<{ id: number }>(
    `SELECT t.id FROM payment_transactions t WHERE t.student_id = $1 AND t.programme_id = $2 AND ${paidTransactionCondition('t', '$3')} LIMIT 1`,
    [studentId, programmeId, process.env.NODE_ENV === 'production' ? 1 : 0]
  );
  return rows.length > 0;
}

function paymentMethod(gatewayMode: string): PaymentTransaction['method'] {
  if (gatewayMode === 'card_transfer') return 'card_transfer';
  if (gatewayMode === 'sandbox') return 'sandbox';
  if (gatewayMode === 'live') return 'online';
  return 'legacy';
}

export function toPaymentTransaction(row: TransactionRow): PaymentTransaction {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    coachId: row.coach_id,
    coachName: row.coach_name,
    amountTomans: row.amount_tomans,
    coachShareTomans: row.coach_share_tomans,
    adminShareTomans: row.admin_share_tomans,
    authority: row.authority,
    status: row.status as PaymentTransaction['status'],
    refId: row.ref_id,
    cardPan: row.card_pan,
    createdAt: row.created_at,
    verifiedAt: row.verified_at,
    method: paymentMethod(row.gateway_mode),
    cardTransferAmountTomans: row.card_transfer_amount_tomans ?? null,
    cardTransferReference: row.card_transfer_reference ?? null,
    cardTransferSenderLast4: row.card_transfer_sender_last4 ?? null,
    cardTransferConfirmedBy: row.card_transfer_confirmed_by ?? null,
  };
}

export async function listCoachTransactions(db: Db, coachId: number): Promise<PaymentTransaction[]> {
  const rows = await db.query<TransactionRow>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     WHERE t.coach_id = $1
     ORDER BY t.id DESC`,
    [coachId]
  );
  return rows.map(toPaymentTransaction);
}

export async function listAllTransactions(db: Db): Promise<PaymentTransaction[]> {
  const rows = await db.query<TransactionRow>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     ORDER BY t.id DESC`
  );
  return rows.map(toPaymentTransaction);
}

