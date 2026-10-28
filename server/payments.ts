import { randomUUID } from 'node:crypto';
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
  gateway_mode: 'sandbox' | 'live' | 'legacy';
  programme_id: string | null;
  programme_mapping: string;
}

export async function migratePayments(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    ALTER TABLE student_programs ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 0;
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
      updated_at TEXT NOT NULL
    );
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
  const cleaned = raw.replace(/\s+/g, '').toUpperCase();
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

/** Simulation must never grant access on a production deployment. */
export function isSandboxMode(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  const merchant = process.env.ZARINPAL_MERCHANT_ID?.trim();
  return process.env.ZARINPAL_SANDBOX === 'true' || !merchant || merchant.toLowerCase() === 'sandbox' || process.env.NODE_ENV === 'test';
}

function liveMerchantId(): string {
  const merchant = process.env.ZARINPAL_MERCHANT_ID?.trim();
  if (!merchant || merchant.toLowerCase() === 'sandbox' || (process.env.NODE_ENV === 'production' && process.env.ZARINPAL_SANDBOX === 'true')) {
    throw new HttpError(503, 'درگاه پرداخت واقعی پیکربندی نشده است. لطفاً با پشتیبانی تماس بگیرید.');
  }
  return merchant;
}

function toTransaction(row: TransactionRow): PaymentTransaction {
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
  };
}

async function pendingCheckout(db: Db, studentId: number, programmeId: string, origin: string, expected: { amount: number; coachId: number }): Promise<{ authority: string; paymentUrl: string } | null> {
  const pending = (await db.query<{ authority: string; gateway_mode: string; amount_tomans: number; coach_id: number }>(`
    SELECT authority, gateway_mode, amount_tomans, coach_id FROM payment_transactions
    WHERE student_id = $1 AND programme_id = $2 AND status = 'pending' ORDER BY id DESC LIMIT 1
  `, [studentId, programmeId]))[0];
  if (!pending) return null;
  if (pending.amount_tomans !== expected.amount || pending.coach_id !== expected.coachId) {
    throw new HttpError(409, 'پرداخت قبلی با قیمت یا مربی متفاوت در انتظار است؛ برای جلوگیری از پرداخت تکراری با پشتیبانی تماس بگیرید.');
  }
  if (!/^[A-Za-z0-9_-]{5,100}$/.test(pending.authority) ||
      (process.env.NODE_ENV === 'production' && (pending.gateway_mode === 'sandbox' || pending.authority.startsWith('SANDBOX-')))) {
    throw new HttpError(503, 'پرداخت قبلی نیاز به بررسی پشتیبانی دارد؛ دوباره پرداخت نکنید.');
  }
  const sandbox = pending.gateway_mode === 'sandbox' || (isSandboxMode() && pending.gateway_mode === 'legacy' && pending.authority.startsWith('A000000000000000000000000000'));
  const paymentUrl = sandbox
    ? `${origin}/payment/sandbox-pay?Authority=${pending.authority}&Amount=${pending.amount_tomans}`
    : `https://payment.zarinpal.com/pg/StartPay/${pending.authority}`;
  return { authority: pending.authority, paymentUrl };
}

/**
 * Initiates payment with ZarinPal. Sends wages array for multi-settlement (تسهیم زرین‌پال).
 */
export async function createPaymentRequest(
  db: Db,
  studentId: number,
  origin: string,
  expected: { id: string; version: number },
  now = new Date()
): Promise<{ authority: string; paymentUrl: string }> {
  const studentRows = await db.query<{
    coach_id: number;
    price_tomans: number | null;
    programme_id: string;
    version: number;
    coach_iban: string | null;
    coach_name: string;
  }>(
    `SELECT u.coach_id, sp.price_tomans, sp.programme_id, sp.version, c.iban AS coach_iban, c.display_name AS coach_name
     FROM users u
     JOIN student_programs sp ON sp.student_id = u.id
     JOIN users c ON c.id = u.coach_id
     WHERE u.id = $1`,
    [studentId]
  );

  const info = studentRows[0];
  if (!info || !info.price_tomans || info.price_tomans <= 0) {
    throw new HttpError(400, 'این برنامه رایگان است یا نیازی به پرداخت ندارد.');
  }
  if (info.programme_id !== expected.id || info.version !== expected.version) {
    throw new HttpError(409, 'برنامه یا قیمت آن تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
  }

  const alreadyPaid = await isProgramPaid(db, studentId, info.programme_id);
  if (alreadyPaid) {
    throw new HttpError(400, 'هزینهٔ این برنامه قبلاً پرداخت شده است.');
  }

  const amount = info.price_tomans;
  const { coachShare, adminShare } = calculateCommission(amount);
  const sandbox = isSandboxMode();
  const merchantId = sandbox ? null : liveMerchantId();
  const existing = await pendingCheckout(db, studentId, info.programme_id, origin, { amount, coachId: info.coach_id });
  if (existing) return existing;
  const callbackUrl = `${origin}/payment/callback`;

  let authority = '';
  let paymentUrl = '';

  if (sandbox) {
    // An unmistakable, collision-resistant identifier; never accepted as a live payment.
    authority = `SANDBOX-${randomUUID()}`;
    paymentUrl = `${origin}/payment/sandbox-pay?Authority=${authority}&Amount=${amount}`;
  } else {
    // Production ZarinPal v4 request
    try {
      const zarinpalEndpoint = 'https://payment.zarinpal.com/pg/v4/payment/request.json';
      const wages = info.coach_iban
        ? [
            {
              iban: info.coach_iban,
              amount: coachShare,
              description: `سهم مربی (${info.coach_name}) از برنامه تمرینی`,
            },
          ]
        : [];

      const payload = {
        merchant_id: merchantId,
        amount,
        currency: 'IRT',
        description: `پرداخت برنامه تمرینی - مربی ${info.coach_name}`,
        callback_url: callbackUrl,
        ...(wages.length > 0 ? { wages } : {}),
      };

      const res = await fetch(zarinpalEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const data = (await res.json()) as { data?: { code: number; authority: string }; errors?: unknown[] };
      if (res.ok && data.data && data.data.code === 100 && /^[A-Za-z0-9_-]{5,100}$/.test(data.data.authority ?? '')) {
        authority = data.data.authority;
        paymentUrl = `https://payment.zarinpal.com/pg/StartPay/${authority}`;
      } else {
        console.error('Zarinpal error response:', data);
        throw new HttpError(502, 'خطا در ارتباط با درگاه پرداخت زرین‌پال.');
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('Failed to connect to ZarinPal:', err);
      throw new HttpError(502, 'اتصال به درگاه پرداخت برقرار نشد. لطفاً دوباره تلاش کنید.');
    }
  }

  const inserted = await db.query<{ authority: string }>(
    `INSERT INTO payment_transactions
     (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, created_at, gateway_mode, programme_id, programme_mapping)
     SELECT $1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, 'explicit'
     WHERE NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE t.student_id = $1 AND t.programme_id = $9
       AND ${paidTransactionCondition('t', '$10')})
     ON CONFLICT DO NOTHING RETURNING authority`,
    [studentId, info.coach_id, amount, coachShare, adminShare, authority, now.toISOString(), sandbox ? 'sandbox' : 'live', info.programme_id, process.env.NODE_ENV === 'production' ? 1 : 0]
  );
  if (!inserted.length) {
    const raced = await pendingCheckout(db, studentId, info.programme_id, origin, { amount, coachId: info.coach_id });
    if (raced) return raced;
    throw new HttpError(409, 'وضعیت پرداخت تغییر کرده است؛ برنامه را دوباره بارگذاری کنید.');
  }
  return { authority, paymentUrl };
}

async function successMessage(db: Db, row: TransactionRow, alreadyPaid: boolean): Promise<string> {
  if (!row.programme_id) {
    return 'پرداخت تأیید شد، اما برنامهٔ این تراکنش قدیمی مشخص نیست. برای بررسی دسترسی با پشتیبانی تماس بگیرید و دوباره پرداخت نکنید.';
  }
  const active = await db.query<{ programme_id: string }>('SELECT programme_id FROM student_programs WHERE student_id = $1', [row.student_id]);
  if (active[0]?.programme_id !== row.programme_id) {
    return 'پرداخت مربوط به برنامهٔ قبلی تأیید شد. آن برنامه در بایگانی قابل مشاهده است و برنامهٔ جدید خرید جداگانه دارد.';
  }
  return alreadyPaid ? 'پرداخت قبلاً با موفقیت تأیید شده است.' : 'پرداخت با موفقیت انجام شد.';
}

function validPaymentReference(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text !== '' && !['undefined', 'null'].includes(text.toLowerCase()) && !text.toUpperCase().startsWith('SANDBOX-');
}

/**
 * Strictly verifies the transaction on the server side with ZarinPal.
 * Idempotent: if already paid, returns success immediately without re-verifying.
 */
export async function verifyPayment(
  db: Db,
  authority: string,
  statusQuery: string,
  now = new Date()
): Promise<{ success: boolean; transaction: PaymentTransaction; message: string }> {
  const rows = await db.query<TransactionRow>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     WHERE t.authority = $1`,
    [authority]
  );

  const row = rows[0];
  if (!row) {
    throw new HttpError(404, 'تراکنش پرداخت یافت نشد.');
  }

  // A database copied from a test environment must not grant a live entitlement.
  if (process.env.NODE_ENV === 'production' && (row.gateway_mode === 'sandbox' || row.ref_id?.trim().toUpperCase().startsWith('SANDBOX-'))) {
    throw new HttpError(503, 'تراکنش آزمایشی در محیط واقعی قابل تأیید نیست.');
  }

  if (process.env.NODE_ENV === 'production' && row.status === 'paid' && !validPaymentReference(row.ref_id)) {
    throw new HttpError(503, 'تراکنش قدیمی شناسهٔ تأیید معتبر ندارد؛ با پشتیبانی تماس بگیرید.');
  }

  // Idempotency: if already verified successfully, return without re-verifying
  if (row.status === 'paid') {
    return {
      success: true,
      transaction: toTransaction(row),
      message: await successMessage(db, row, true),
    };
  }

  // If user canceled at gateway or gateway returned NOK
  if (statusQuery !== 'OK') {
    await db.query("UPDATE payment_transactions SET status = 'canceled' WHERE id = $1", [row.id]);
    row.status = 'canceled';
    return {
      success: false,
      transaction: toTransaction(row),
      message: 'پرداخت در درگاه بانکی لغو شد یا ناموفق بود.',
    };
  }

  const sandbox = isSandboxMode();
  let verifiedRefId = '';
  let verifiedCardPan: string | null = null;

  // Old transactions are ambiguous. In production they can only pass real gateway verification.
  // A transaction explicitly created as sandbox can never unlock a live deployment.
  if (row.gateway_mode === 'sandbox' && !sandbox) {
    throw new HttpError(503, 'تراکنش آزمایشی در محیط واقعی قابل تأیید نیست.');
  }
  const legacySandbox = row.gateway_mode === 'legacy' && authority.startsWith('A000000000000000000000000000');
  if (sandbox && (row.gateway_mode === 'sandbox' || legacySandbox)) {
    verifiedRefId = `SANDBOX-${randomUUID()}`;
    verifiedCardPan = null;
  } else {
    // Even with a familiar-looking authority, live transactions must reach ZarinPal.
    const merchantId = liveMerchantId();
    try {
      const zarinpalVerifyEndpoint = 'https://payment.zarinpal.com/pg/v4/payment/verify.json';
      const res = await fetch(zarinpalVerifyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          merchant_id: merchantId,
          amount: row.amount_tomans,
          authority,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const body = (await res.json()) as {
        data?: { code: number; ref_id: number | string; card_pan?: string };
        errors?: unknown[];
      };

      if (res.ok && body.data && (body.data.code === 100 || body.data.code === 101) && validPaymentReference(body.data.ref_id)) {
        verifiedRefId = String(body.data.ref_id);
        verifiedCardPan = body.data.card_pan ?? null;
      } else {
        await db.query("UPDATE payment_transactions SET status = 'failed' WHERE id = $1", [row.id]);
        row.status = 'failed';
        return {
          success: false,
          transaction: toTransaction(row),
          message: 'تأیید تراکنش توسط زرین‌پال پذیرفته نشد.',
        };
      }
    } catch (err) {
      console.error('ZarinPal verify error:', err);
      throw new HttpError(502, 'خطا در ارتباط با سرور زرین‌پال جهت تأیید تراکنش.');
    }
  }

  const verifiedAt = now.toISOString();
  await db.query(
    "UPDATE payment_transactions SET status = 'paid', ref_id = $1, card_pan = $2, verified_at = $3 WHERE id = $4",
    [verifiedRefId, verifiedCardPan, verifiedAt, row.id]
  );

  row.status = 'paid';
  row.ref_id = verifiedRefId;
  row.card_pan = verifiedCardPan;
  row.verified_at = verifiedAt;

  return {
    success: true,
    transaction: toTransaction(row),
    message: await successMessage(db, row, false),
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
  return rows.map(toTransaction);
}

export async function listAllTransactions(db: Db): Promise<PaymentTransaction[]> {
  const rows = await db.query<TransactionRow>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     ORDER BY t.id DESC`
  );
  return rows.map(toTransaction);
}

export async function getTransactionByAuthority(db: Db, authority: string): Promise<PaymentTransaction | null> {
  const rows = await db.query<TransactionRow>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     WHERE t.authority = $1`,
    [authority]
  );
  return rows[0] ? toTransaction(rows[0]) : null;
}
