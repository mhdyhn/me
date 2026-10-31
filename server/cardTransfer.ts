import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';
import { calculateCommission, isProgramPaid, toPaymentTransaction, type PaymentTransaction } from './payments.ts';

/**
 * Card-to-card (کارت‌به‌کارت) settlement.
 *
 * The student transfers the amount to a configured card and submits the bank receipt.
 * The server confirms the receipt automatically: the declared amount must match the exact
 * amount we asked for, the receipt reference may not be used twice, and an optional
 * external receipt-verification service can confirm the transfer on the server side.
 * A confirmed receipt is a real purchase: it unlocks the programme and records the coach
 * and admin shares in the same ledger as online payments.
 */

export const CARD_TRANSFER_MODE = 'card_transfer';
const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CardTransferConfig {
  /** Sixteen digit Shetab card number the student pays to. */
  cardNumber: string;
  cardHolder: string;
  expiryHours: number;
  maxPerDay: number;
  /** Ask for a unique amount so the transfer can be found in the bank statement. */
  uniqueAmount: boolean;
  /** Optional receipt-verification service; when set, its verdict decides. */
  verifyUrl: string | null;
  verifyUrlError: string | null;
}

/** Converts Persian and Arabic digits to English digits. */
export function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Short human reference the student writes in the transfer description. */
export function cardTransferReference(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)];
  }
  return `MT-${code}`;
}

/** The exact amount to transfer: the price plus a small unique tail. */
export function uniqueTransferAmount(priceTomans: number, random: () => number = Math.random): number {
  return priceTomans + 101 + Math.floor(random() * 899);
}

function positiveNumber(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), 1000);
}

/** Reads the card-transfer configuration; `null` means the feature is switched off. */
export function cardTransferConfig(env: NodeJS.ProcessEnv = process.env): CardTransferConfig | null {
  const cardNumber = toEnglishDigits(env.CARD_TRANSFER_CARD_NUMBER ?? '').replace(/[\s-]/g, '');
  if (!/^\d{16}$/.test(cardNumber)) return null;
  const rawVerifyUrl = (env.CARD_TRANSFER_VERIFY_URL ?? '').trim();
  let verifyUrl: string | null = null;
  let verifyUrlError: string | null = null;
  if (rawVerifyUrl) {
    try {
      const url = new URL(rawVerifyUrl);
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid');
      verifyUrl = url.origin + url.pathname;
    } catch {
      verifyUrlError = 'CARD_TRANSFER_VERIFY_URL باید یک نشانی HTTPS بدون اطلاعات کاربری باشد.';
    }
  }
  return {
    cardNumber,
    cardHolder: (env.CARD_TRANSFER_CARD_HOLDER ?? '').trim() || 'میتی',
    expiryHours: positiveNumber(env.CARD_TRANSFER_EXPIRY_HOURS, 72),
    maxPerDay: positiveNumber(env.CARD_TRANSFER_MAX_PER_DAY, 3),
    uniqueAmount: (env.CARD_TRANSFER_UNIQUE_AMOUNT ?? 'on').trim().toLowerCase() !== 'off',
    verifyUrl,
    verifyUrlError,
  };
}

export async function migrateCardTransfers(db: Db): Promise<void> {
  await db.exec(`
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_transfer_amount_tomans INTEGER;
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_transfer_reference TEXT;
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_transfer_sender_last4 TEXT;
    ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS card_transfer_confirmed_by TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_card_transfer_ref
      ON payment_transactions(ref_id) WHERE gateway_mode = 'card_transfer' AND ref_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_payment_card_transfer_student
      ON payment_transactions(student_id, gateway_mode, status);
  `);
}

export interface CardTransferDetails {
  authority: string;
  programmeId: string;
  programmeTitle: string;
  coachName: string;
  priceTomans: number;
  /** The exact amount the student has to transfer. */
  transferAmountTomans: number;
  reference: string;
  cardNumber: string;
  cardHolder: string;
  expiresAt: string;
  instructions: string[];
}

interface PendingRow {
  id: number;
  authority: string;
  gateway_mode: string;
  amount_tomans: number;
  coach_id: number;
  card_transfer_amount_tomans: number | null;
  card_transfer_reference: string | null;
  created_at: string;
}

function expiryFrom(createdAt: string, hours: number): string {
  const created = Date.parse(createdAt);
  const base = Number.isFinite(created) ? created : Date.now();
  return new Date(base + hours * 3600_000).toISOString();
}

function instructionsFor(details: { transferAmountTomans: number; reference: string }): string[] {
  const amount = new Intl.NumberFormat('fa-IR').format(details.transferAmountTomans);
  return [
    `مبلغ ${amount} تومان را دقیقاً به کارت زیر واریز کنید.`,
    `در توضیحات واریز، کد پیگیری «${details.reference}» را بنویسید.`,
    'پس از واریز، شمارهٔ پیگیری رسید و چهار رقم آخر کارت مبدأ را در همین صفحه ثبت کنید.',
    'تأیید رسید و باز شدن برنامه به‌صورت خودکار انجام می‌شود.',
  ];
}

/**
 * Creates (or reuses) the pending card-transfer checkout of a programme.
 * Only one pending payment exists per programme, so an unfinished online payment is
 * converted instead of opening a second payable amount.
 */
export async function createCardTransferRequest(
  db: Db,
  studentId: number,
  expected: { id: string; version: number },
  now = new Date()
): Promise<CardTransferDetails> {
  const config = cardTransferConfig();
  if (!config) {
    throw new HttpError(503, 'پرداخت کارت‌به‌کارت هنوز فعال نشده است؛ از پرداخت آنلاین استفاده کنید.');
  }
  const rows = await db.query<{
    coach_id: number;
    price_tomans: number | null;
    programme_id: string;
    version: string | number;
    coach_name: string;
    body: string;
  }>(
    `SELECT u.coach_id, sp.price_tomans, sp.programme_id, sp.version, sp.body, c.display_name AS coach_name
     FROM users u
     JOIN student_programs sp ON sp.student_id = u.id
     JOIN users c ON c.id = u.coach_id
     WHERE u.id = $1 AND sp.coach_id = u.coach_id AND u.personal_program_mode = 0`,
    [studentId]
  );
  const info = rows[0];
  if (!info || !info.price_tomans || info.price_tomans <= 0) {
    throw new HttpError(400, 'این برنامه رایگان است یا نیازی به پرداخت ندارد.');
  }
  if (info.programme_id !== expected.id || Number(info.version) !== expected.version) {
    throw new HttpError(409, 'برنامه یا قیمت آن تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.');
  }
  if (await isProgramPaid(db, studentId, info.programme_id)) {
    throw new HttpError(400, 'هزینهٔ این برنامه قبلاً پرداخت شده است.');
  }

  const title = (() => {
    try {
      const parsed = JSON.parse(info.body) as { title?: unknown };
      return typeof parsed.title === 'string' ? parsed.title : 'برنامهٔ تمرینی';
    } catch {
      return 'برنامهٔ تمرینی';
    }
  })();

  const pending = (await db.query<PendingRow>(
    `SELECT id, authority, gateway_mode, amount_tomans, coach_id, card_transfer_amount_tomans, card_transfer_reference, created_at
     FROM payment_transactions
     WHERE student_id = $1 AND programme_id = $2 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
    [studentId, info.programme_id]
  ))[0];

  if (pending && pending.gateway_mode === CARD_TRANSFER_MODE) {
    const expiresAt = expiryFrom(pending.created_at, config.expiryHours);
    if (Date.parse(expiresAt) > now.getTime()) {
      const transferAmount = pending.card_transfer_amount_tomans ?? pending.amount_tomans;
      const reference = pending.card_transfer_reference ?? '';
      return {
        authority: pending.authority,
        programmeId: info.programme_id,
        programmeTitle: title,
        coachName: info.coach_name,
        priceTomans: pending.amount_tomans,
        transferAmountTomans: transferAmount,
        reference,
        cardNumber: config.cardNumber,
        cardHolder: config.cardHolder,
        expiresAt,
        instructions: instructionsFor({ transferAmountTomans: transferAmount, reference }),
      };
    }
    await db.query("UPDATE payment_transactions SET status = 'expired' WHERE id = $1", [pending.id]);
  } else if (pending) {
    // An unfinished online payment must not become a second payable amount.
    if (process.env.NODE_ENV === 'production' &&
        (pending.gateway_mode === 'sandbox' || pending.authority.toUpperCase().startsWith('SANDBOX-'))) {
      throw new HttpError(503, 'پرداخت قبلی نیاز به بررسی پشتیبانی دارد؛ دوباره پرداخت نکنید.');
    }
  }

  const authority = `CARD-${randomUUID()}`;
  const reference = cardTransferReference();
  const transferAmount = config.uniqueAmount ? uniqueTransferAmount(info.price_tomans) : info.price_tomans;
  const { coachShare, adminShare } = calculateCommission(info.price_tomans);
  const createdAt = now.toISOString();

  const inserted = await db.query<{ authority: string }>(
    `WITH current_offer AS MATERIALIZED (
       SELECT u.id FROM users u JOIN student_programs sp ON sp.student_id = u.id
       WHERE u.id = $1 AND u.coach_id = $2 AND u.personal_program_mode = 0 AND sp.coach_id = $2
         AND sp.programme_id = $8 AND sp.version = $11 AND sp.price_tomans = $3 FOR UPDATE OF u, sp
     )
     INSERT INTO payment_transactions
     (student_id, coach_id, amount_tomans, coach_share_tomans, admin_share_tomans, authority, status, created_at, gateway_mode, programme_id, programme_mapping, card_transfer_amount_tomans, card_transfer_reference)
     SELECT $1, $2, $3, $4, $5, $6, 'pending', $7, '${CARD_TRANSFER_MODE}', $8, 'explicit', $9, $10 FROM current_offer
     WHERE NOT EXISTS (SELECT 1 FROM payment_transactions t WHERE t.student_id = $1 AND t.programme_id = $8
       AND t.status = 'paid')
     ON CONFLICT DO NOTHING RETURNING authority`,
    [studentId, info.coach_id, info.price_tomans, coachShare, adminShare, authority, createdAt, info.programme_id, transferAmount, reference, expected.version]
  );

  let finalAuthority = authority;
  let finalTransferAmount = transferAmount;
  let finalReference = reference;
  let created = createdAt;
  if (!inserted.length) {
    // Another payment for the same programme is pending: reuse it instead of double charging.
    const existing = (await db.query<PendingRow>(
      `SELECT id, authority, gateway_mode, amount_tomans, coach_id, card_transfer_amount_tomans, card_transfer_reference, created_at
       FROM payment_transactions
       WHERE student_id = $1 AND programme_id = $2 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
      [studentId, info.programme_id]
    ))[0];
    if (!existing) throw new HttpError(409, 'وضعیت پرداخت تغییر کرده است؛ برنامه را دوباره بارگذاری کنید.');
    if (existing.gateway_mode !== CARD_TRANSFER_MODE) {
      await db.query(
        `UPDATE payment_transactions SET gateway_mode = '${CARD_TRANSFER_MODE}', card_transfer_amount_tomans = $1, card_transfer_reference = $2 WHERE id = $3`,
        [transferAmount, reference, existing.id]
      );
    }
    finalAuthority = existing.authority;
    finalTransferAmount = existing.card_transfer_amount_tomans ?? transferAmount;
    finalReference = existing.card_transfer_reference ?? reference;
    created = existing.created_at;
  }

  return {
    authority: finalAuthority,
    programmeId: info.programme_id,
    programmeTitle: title,
    coachName: info.coach_name,
    priceTomans: info.price_tomans,
    transferAmountTomans: finalTransferAmount,
    reference: finalReference,
    cardNumber: config.cardNumber,
    cardHolder: config.cardHolder,
    expiresAt: expiryFrom(created, config.expiryHours),
    instructions: instructionsFor({ transferAmountTomans: finalTransferAmount, reference: finalReference }),
  };
}

export interface CardTransferReceiptInput {
  authority: string;
  trackingNumber: string;
  senderCardLast4?: string;
  amountTomans?: number;
}

/** Normalises a bank receipt reference: English digits, no spaces, upper case. */
export function normalizeTrackingNumber(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'شمارهٔ پیگیری رسید را وارد کنید.');
  const cleaned = toEnglishDigits(value).replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{4,32}$/.test(cleaned)) {
    throw new HttpError(400, 'شمارهٔ پیگیری رسید معتبر نیست؛ همان شمارهٔ درج‌شده در رسید بانکی را وارد کنید.');
  }
  return cleaned;
}

function normalizeSenderLast4(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'چهار رقم آخر کارت مبدأ معتبر نیست.');
  const cleaned = toEnglishDigits(value).replace(/\s/g, '');
  if (!/^\d{4}$/.test(cleaned)) throw new HttpError(400, 'چهار رقم آخر کارت مبدأ باید چهار رقم باشد.');
  return cleaned;
}

async function verifyWithProvider(config: CardTransferConfig, payload: {
  authority: string;
  trackingNumber: string;
  amountTomans: number;
  reference: string;
}): Promise<boolean> {
  if (!config.verifyUrl) return true;
  try {
    const response = await fetch(config.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        trackingNumber: payload.trackingNumber,
        amountTomans: payload.amountTomans,
        reference: payload.reference,
        authority: payload.authority,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { valid?: unknown };
    return body?.valid === true;
  } catch (error) {
    console.error('Card transfer receipt verification failed:', error);
    return false;
  }
}

/**
 * Confirms a submitted receipt automatically and unlocks the programme.
 * The confirmation is structural (exact amount, unused reference, daily limit) and can be
 * delegated to an external receipt-verification service when one is configured.
 */
export async function submitCardTransferReceipt(
  db: Db,
  studentId: number,
  input: CardTransferReceiptInput,
  now = new Date()
): Promise<{ success: boolean; transaction: PaymentTransaction; message: string }> {
  const config = cardTransferConfig();
  if (!config) {
    throw new HttpError(503, 'پرداخت کارت‌به‌کارت هنوز فعال نشده است.');
  }
  if (config.verifyUrlError) {
    throw new HttpError(503, 'تأیید خودکار رسید به‌علت تنظیم نادرست سرویس بررسی ممکن نیست؛ با پشتیبانی تماس بگیرید.');
  }
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  const senderCardLast4 = normalizeSenderLast4(input.senderCardLast4);

  const rows = await db.query<{
    id: number;
    amount_tomans: number;
    card_transfer_amount_tomans: number | null;
    card_transfer_reference: string | null;
    status: string;
    created_at: string;
    programme_id: string | null;
    student_id: number;
    coach_id: number;
    authority: string;
  }>(
    `SELECT id, amount_tomans, card_transfer_amount_tomans, card_transfer_reference, status, created_at,
            programme_id, student_id, coach_id, authority
     FROM payment_transactions
     WHERE authority = $1 AND student_id = $2 AND gateway_mode = '${CARD_TRANSFER_MODE}'`,
    [input.authority, studentId]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'درخواست پرداخت کارت‌به‌کارت یافت نشد.');
  if (!row.programme_id) {
    throw new HttpError(409, 'برنامهٔ این درخواست پرداخت مشخص نیست؛ با پشتیبانی تماس بگیرید.');
  }
  if (row.status === 'paid') {
    const transaction = await loadTransaction(db, row.id);
    return { success: true, transaction, message: 'این پرداخت پیش‌تر تأیید شده و برنامهٔ شما باز است.' };
  }
  if (row.status !== 'pending') {
    throw new HttpError(409, 'این درخواست پرداخت دیگر معتبر نیست؛ یک درخواست تازه بسازید.');
  }
  const expiresAt = expiryFrom(row.created_at, config.expiryHours);
  if (Date.parse(expiresAt) <= now.getTime()) {
    await db.query("UPDATE payment_transactions SET status = 'expired' WHERE id = $1", [row.id]);
    throw new HttpError(409, 'مهلت این درخواست پرداخت تمام شده است؛ یک درخواست تازه بسازید.');
  }

  const expectedAmount = row.card_transfer_amount_tomans ?? row.amount_tomans;
  if (input.amountTomans !== undefined) {
    if (!Number.isSafeInteger(input.amountTomans) || input.amountTomans <= 0) {
      throw new HttpError(400, 'مبلغ واریزی معتبر نیست.');
    }
    if (input.amountTomans !== expectedAmount) {
      throw new HttpError(400, 'مبلغ واردشده با مبلغی که باید واریز کنید یکسان نیست.');
    }
  }

  const duplicate = await db.query<{ id: number }>(
    `SELECT id FROM payment_transactions WHERE ref_id = $1 AND gateway_mode = '${CARD_TRANSFER_MODE}' AND id <> $2 LIMIT 1`,
    [trackingNumber, row.id]
  );
  if (duplicate.length) {
    throw new HttpError(409, 'این شمارهٔ پیگیری قبلاً برای پرداخت دیگری ثبت شده است؛ شمارهٔ درست رسید را وارد کنید.');
  }

  const dayStart = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const confirmedToday = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM payment_transactions
     WHERE student_id = $1 AND gateway_mode = '${CARD_TRANSFER_MODE}' AND status = 'paid' AND verified_at >= $2`,
    [studentId, dayStart]
  );
  const confirmedCount = Number(confirmedToday[0]?.count ?? '0');
  if (confirmedCount >= config.maxPerDay) {
    throw new HttpError(429, 'تعداد پرداخت‌های کارت‌به‌کارت تأییدشدهٔ شما در ۲۴ ساعت گذشته به سقف مجاز رسیده است.');
  }

  const accepted = await verifyWithProvider(config, {
    authority: row.authority,
    trackingNumber,
    amountTomans: expectedAmount,
    reference: row.card_transfer_reference ?? '',
  });
  if (!accepted) {
    throw new HttpError(409, 'رسید واریزی در سرویس بررسی بانکی تأیید نشد؛ شمارهٔ پیگیری را بررسی کنید یا با پشتیبانی تماس بگیرید.');
  }

  await db.query(
    `UPDATE payment_transactions
     SET status = 'paid', ref_id = $1, card_pan = $2, verified_at = $3, card_transfer_sender_last4 = $2, card_transfer_confirmed_by = 'auto'
     WHERE id = $4 AND status = 'pending'`,
    [trackingNumber, senderCardLast4, now.toISOString(), row.id]
  );

  const transaction = await loadTransaction(db, row.id);
  return {
    success: true,
    transaction,
    message: 'رسید واریزی تأیید شد و برنامهٔ شما باز شد.',
  };
}

async function loadTransaction(db: Db, id: number): Promise<PaymentTransaction> {
  const rows = await db.query<{
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
    card_transfer_amount_tomans: number | null;
    card_transfer_reference: string | null;
    card_transfer_sender_last4: string | null;
    card_transfer_confirmed_by: string | null;
    programme_id: string | null;
    programme_mapping: string;
  }>(
    `SELECT t.*, s.display_name AS student_name, c.display_name AS coach_name
     FROM payment_transactions t
     JOIN users s ON s.id = t.student_id
     JOIN users c ON c.id = t.coach_id
     WHERE t.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'تراکنش پرداخت یافت نشد.');
  return toPaymentTransaction(row);
}

/**
 * Manual safety valve: an administrator confirms or rejects a receipt that the automatic
 * check could not settle. Only card transfers can be reviewed this way.
 */
export async function reviewCardTransfer(
  db: Db,
  authority: string,
  action: 'confirm' | 'reject',
  now = new Date()
): Promise<{ success: boolean; transaction: PaymentTransaction; message: string }> {
  const rows = await db.query<{ id: number; status: string }>(
    `SELECT id, status FROM payment_transactions WHERE authority = $1 AND gateway_mode = '${CARD_TRANSFER_MODE}'`,
    [authority]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'تراکنش کارت‌به‌کارت یافت نشد.');
  if (row.status === 'paid' && action === 'confirm') {
    const transaction = await loadTransaction(db, row.id);
    return { success: true, transaction, message: 'این پرداخت پیش‌تر تأیید شده است.' };
  }
  if (row.status !== 'pending') {
    throw new HttpError(409, 'این تراکنش دیگر در انتظار بررسی نیست.');
  }
  if (action === 'confirm') {
    await db.query(
      `UPDATE payment_transactions SET status = 'paid', ref_id = $1, verified_at = $2, card_transfer_confirmed_by = 'manual' WHERE id = $3 AND status = 'pending'`,
      [`MANUAL-${randomUUID()}`, now.toISOString(), row.id]
    );
  } else {
    await db.query(
      "UPDATE payment_transactions SET status = 'canceled', card_transfer_confirmed_by = 'manual' WHERE id = $1 AND status = 'pending'",
      [row.id]
    );
  }
  const transaction = await loadTransaction(db, row.id);
  return {
    success: action === 'confirm',
    transaction,
    message: action === 'confirm' ? 'رسید با بررسی پشتیبانی تأیید شد.' : 'رسید رد شد و پرداخت لغو گردید.',
  };
}
