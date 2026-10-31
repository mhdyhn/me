import { randomUUID } from 'node:crypto';
import type { Db } from './db.ts';
import { HttpError } from './http.ts';
import {
  cardTransferConfig,
  cardTransferReference,
  normalizeTrackingNumber,
  uniqueTransferAmount,
  verifyWithProvider,
} from './cardTransfer.ts';

/**
 * The optional student subscription.
 *
 * The base product stays free: a student can use the programme their coach sold them and
 * everything around it without paying. The subscription unlocks the smart features
 * (progress report first, the suggested programme next) and is bought the same way as a
 * programme: card-to-card with an automatic receipt confirmation.
 *
 * A coach who referred the student through their registration link earns a referral share
 * of the subscription; without that referral the whole amount belongs to the platform.
 */

/** The monthly price in tomans; the admin can change it in the environment. */
export const SUBSCRIPTION_PRICE_TOMANS = 99_000;
/** The share of a referred subscription that belongs to the coach who referred the student. */
export const SUBSCRIPTION_REFERRAL_PERCENT = 10;
/** How long one paid month lasts. */
export const SUBSCRIPTION_PERIOD_DAYS = 30;

export interface SubscriptionState {
  /** The monthly price in tomans. */
  priceTomans: number;
  /** Whether the smart features are open right now. */
  active: boolean;
  /** When the current period ends. */
  expiresAt: string | null;
  /** The whole days left in the current period. */
  daysLeft: number;
  /** The coach who referred the student, when the student came through their link. */
  referralCoachName: string | null;
  /** Whether card-to-card is available for the subscription. */
  cardTransferAvailable: boolean;
}

/** The price from the environment, falling back to the standard price. */
export function subscriptionPriceTomans(env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.SUBSCRIPTION_PRICE_TOMANS ?? '').trim();
  if (!raw) return SUBSCRIPTION_PRICE_TOMANS;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1000 || value > 50_000_000) return SUBSCRIPTION_PRICE_TOMANS;
  return Math.floor(value);
}

/** The referral share of the coach, in tomans. */
export function referralShareTomans(amountTomans: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = (env.SUBSCRIPTION_REFERRAL_PERCENT ?? '').trim();
  const percent = raw === '' ? SUBSCRIPTION_REFERRAL_PERCENT : Number(raw);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return Math.floor((amountTomans * SUBSCRIPTION_REFERRAL_PERCENT) / 100);
  return Math.floor((amountTomans * percent) / 100);
}

export async function migrateSubscriptions(db: Db): Promise<void> {
  await db.exec(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_coach_id INTEGER REFERENCES users(id);
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'monthly',
      amount_tomans INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      source_coach_id INTEGER REFERENCES users(id),
      coach_share_tomans INTEGER NOT NULL DEFAULT 0,
      admin_share_tomans INTEGER NOT NULL DEFAULT 0,
      authority TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subscription_user ON subscriptions(user_id, status);
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_tomans INTEGER NOT NULL,
      transfer_amount_tomans INTEGER NOT NULL,
      reference TEXT NOT NULL UNIQUE,
      authority TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      tracking_number TEXT,
      sender_card_last4 TEXT,
      source_coach_id INTEGER REFERENCES users(id),
      created_at TEXT NOT NULL,
      confirmed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_subscription_payment_user ON subscription_payments(user_id, status);
  `);
}

interface SubscriptionRow {
  expires_at: string;
  amount_tomans: number;
  source_coach_id: number | null;
  coach_share_tomans: number;
  status: string;
}

/** The current subscription of a user, or `null` when there is none. */
export async function subscriptionState(db: Db, userId: number, now = new Date()): Promise<SubscriptionState> {
  const rows = await db.query<SubscriptionRow & { coach_name: string | null }>(
    `SELECT s.expires_at, s.amount_tomans, s.source_coach_id, s.coach_share_tomans, s.status, c.display_name AS coach_name
     FROM subscriptions s LEFT JOIN users c ON c.id = s.source_coach_id
     WHERE s.user_id = $1 AND s.status = 'active' AND s.expires_at > $2
     ORDER BY s.expires_at DESC LIMIT 1`,
    [userId, now.toISOString()]
  );
  const row = rows[0];
  const expiresAt = row?.expires_at ?? null;
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now.getTime()) / 86_400_000)) : 0;
  return {
    priceTomans: subscriptionPriceTomans(),
    active: Boolean(row),
    expiresAt,
    daysLeft,
    referralCoachName: row?.coach_name ?? null,
    cardTransferAvailable: cardTransferConfig() !== null,
  };
}

export interface SubscriptionCheckout {
  authority: string;
  priceTomans: number;
  transferAmountTomans: number;
  reference: string;
  cardNumber: string;
  cardHolder: string;
  expiresAt: string;
  instructions: string[];
}

function expiryFrom(createdAt: string, hours: number): string {
  const created = Date.parse(createdAt);
  const base = Number.isFinite(created) ? created : Date.now();
  return new Date(base + hours * 3600_000).toISOString();
}

function instructionsFor(amount: number, reference: string): string[] {
  const money = new Intl.NumberFormat('fa-IR').format(amount);
  return [
    `مبلغ ${money} تومان را دقیقاً به کارت زیر واریز کنید.`,
    `در توضیحات واریز، کد پیگیری «${reference}» را بنویسید.`,
    'پس از واریز، شمارهٔ پیگیری رسید را در همین صفحه ثبت کنید.',
    'تأیید رسید خودکار است و اشتراک شما بلافاصله فعال می‌شود.',
  ];
}

/**
 * Starts the card-to-card purchase of one subscription month.
 * An unfinished request is reused, so the student is never asked to pay twice.
 */
export async function createSubscriptionCheckout(db: Db, userId: number, now = new Date()): Promise<SubscriptionCheckout> {
  const config = cardTransferConfig();
  if (!config) {
    throw new HttpError(503, 'خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.');
  }
  const state = await subscriptionState(db, userId, now);
  if (state.active) {
    throw new HttpError(409, 'اشتراک شما فعال است؛ تا پایان این دوره نیازی به خرید دوباره نیست.');
  }
  const price = subscriptionPriceTomans();
  const pending = (await db.query<{
    id: number;
    authority: string;
    amount_tomans: number;
    transfer_amount_tomans: number;
    reference: string;
    created_at: string;
    status: string;
  }>(
    `SELECT id, authority, amount_tomans, transfer_amount_tomans, reference, created_at, status
     FROM subscription_payments WHERE user_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
    [userId]
  ))[0];
  if (pending) {
    const expiresAt = expiryFrom(pending.created_at, config.expiryHours);
    if (Date.parse(expiresAt) > now.getTime()) {
      return {
        authority: pending.authority,
        priceTomans: pending.amount_tomans,
        transferAmountTomans: pending.transfer_amount_tomans,
        reference: pending.reference,
        cardNumber: config.cardNumber,
        cardHolder: config.cardHolder,
        expiresAt,
        instructions: instructionsFor(pending.transfer_amount_tomans, pending.reference),
      };
    }
    await db.query("UPDATE subscription_payments SET status = 'expired' WHERE id = $1", [pending.id]);
  }

  const coach = (await db.query<{ referred_by_coach_id: number | null }>(
    'SELECT referred_by_coach_id FROM users WHERE id = $1',
    [userId]
  ))[0];
  const authority = `SUB-${randomUUID()}`;
  const reference = cardTransferReference();
  const transferAmount = config.uniqueAmount ? uniqueTransferAmount(price) : price;
  const createdAt = now.toISOString();
  const inserted = await db.query<{ id: number }>(
    `INSERT INTO subscription_payments
     (user_id, amount_tomans, transfer_amount_tomans, reference, authority, status, source_coach_id, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7)
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId, price, transferAmount, reference, authority, coach?.referred_by_coach_id ?? null, createdAt]
  );
  if (!inserted.length) {
    const existing = (await db.query<{
      authority: string;
      amount_tomans: number;
      transfer_amount_tomans: number;
      reference: string;
      created_at: string;
    }>(
      `SELECT authority, amount_tomans, transfer_amount_tomans, reference, created_at
       FROM subscription_payments WHERE user_id = $1 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
      [userId]
    ))[0];
    if (!existing) throw new HttpError(409, 'وضعیت پرداخت تغییر کرده است؛ دوباره تلاش کنید.');
    return {
      authority: existing.authority,
      priceTomans: existing.amount_tomans,
      transferAmountTomans: existing.transfer_amount_tomans,
      reference: existing.reference,
      cardNumber: config.cardNumber,
      cardHolder: config.cardHolder,
      expiresAt: expiryFrom(existing.created_at, config.expiryHours),
      instructions: instructionsFor(existing.transfer_amount_tomans, existing.reference),
    };
  }
  return {
    authority,
    priceTomans: price,
    transferAmountTomans: transferAmount,
    reference,
    cardNumber: config.cardNumber,
    cardHolder: config.cardHolder,
    expiresAt: expiryFrom(createdAt, config.expiryHours),
    instructions: instructionsFor(transferAmount, reference),
  };
}

export interface SubscriptionReceiptInput {
  authority: string;
  trackingNumber: string;
  senderCardLast4?: string;
  amountTomans?: number;
}

/**
 * Confirms the receipt of a subscription automatically and opens the smart features.
 * The confirmation is structural: the exact amount, an unused receipt reference, the daily
 * limit and, when configured, the external receipt-verification service.
 */
export async function submitSubscriptionReceipt(
  db: Db,
  userId: number,
  input: SubscriptionReceiptInput,
  now = new Date()
): Promise<{ success: boolean; message: string; state: SubscriptionState }> {
  const config = cardTransferConfig();
  if (!config) throw new HttpError(503, 'خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.');
  if (config.verifyUrlError) {
    throw new HttpError(503, 'تأیید خودکار رسید به‌علت تنظیم نادرست سرویس بررسی ممکن نیست؛ با پشتیبانی تماس بگیرید.');
  }
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber);
  const senderLast4 = typeof input.senderCardLast4 === 'string' && input.senderCardLast4.trim()
    ? input.senderCardLast4.trim().replace(/[۰-۹٠-٩]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    : null;
  if (senderLast4 !== null && !/^\d{4}$/.test(senderLast4)) {
    throw new HttpError(400, 'چهار رقم آخر کارت مبدأ باید چهار رقم باشد.');
  }

  const rows = await db.query<{
    id: number;
    amount_tomans: number;
    transfer_amount_tomans: number;
    reference: string;
    authority: string;
    status: string;
    created_at: string;
    source_coach_id: number | null;
  }>(
    `SELECT id, amount_tomans, transfer_amount_tomans, reference, authority, status, created_at, source_coach_id
     FROM subscription_payments WHERE authority = $1 AND user_id = $2`,
    [input.authority, userId]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'درخواست خرید اشتراک یافت نشد.');
  if (row.status === 'paid') {
    const state = await subscriptionState(db, userId, now);
    return { success: true, message: 'این پرداخت پیش‌تر تأیید شده و اشتراک شما فعال است.', state };
  }
  if (row.status !== 'pending') {
    throw new HttpError(409, 'این درخواست خرید دیگر معتبر نیست؛ یک درخواست تازه بسازید.');
  }
  const expiresAt = expiryFrom(row.created_at, config.expiryHours);
  if (Date.parse(expiresAt) <= now.getTime()) {
    await db.query("UPDATE subscription_payments SET status = 'expired' WHERE id = $1", [row.id]);
    throw new HttpError(409, 'مهلت این درخواست تمام شده است؛ یک درخواست تازه بسازید.');
  }
  if (input.amountTomans !== undefined) {
    if (!Number.isSafeInteger(input.amountTomans) || input.amountTomans <= 0) {
      throw new HttpError(400, 'مبلغ واریزی معتبر نیست.');
    }
    if (input.amountTomans !== row.transfer_amount_tomans) {
      throw new HttpError(400, 'مبلغ واردشده با مبلغی که باید واریز کنید یکسان نیست.');
    }
  }
  const duplicate = await db.query<{ id: number }>(
    'SELECT id FROM subscription_payments WHERE tracking_number = $1 AND id <> $2 LIMIT 1',
    [trackingNumber, row.id]
  );
  if (duplicate.length) {
    throw new HttpError(409, 'این شمارهٔ پیگیری قبلاً ثبت شده است؛ شمارهٔ درست رسید را وارد کنید.');
  }
  const dayStart = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const confirmedToday = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM subscription_payments
     WHERE user_id = $1 AND status = 'paid' AND confirmed_at >= $2`,
    [userId, dayStart]
  );
  if (Number(confirmedToday[0]?.count ?? '0') >= config.maxPerDay) {
    throw new HttpError(429, 'تعداد پرداخت‌های کارت‌به‌کارت تأییدشدهٔ شما در ۲۴ ساعت گذشته به سقف مجاز رسیده است.');
  }
  const accepted = await verifyWithProvider(config, {
    authority: row.authority,
    trackingNumber,
    amountTomans: row.transfer_amount_tomans,
    reference: row.reference,
  });
  if (!accepted) {
    throw new HttpError(409, 'رسید واریزی در سرویس بررسی بانکی تأیید نشد؛ شمارهٔ پیگیری را بررسی کنید یا با پشتیبانی تماس بگیرید.');
  }

  const coachShare = row.source_coach_id ? referralShareTomans(row.amount_tomans) : 0;
  const adminShare = row.amount_tomans - coachShare;
  const startedAt = now.toISOString();
  const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 86_400_000).toISOString();
  await db.query(
    `UPDATE subscription_payments SET status = 'paid', tracking_number = $1, sender_card_last4 = $2, confirmed_at = $3 WHERE id = $4 AND status = 'pending'`,
    [trackingNumber, senderLast4, startedAt, row.id]
  );
  await db.query(
    `INSERT INTO subscriptions
     (user_id, plan, amount_tomans, status, started_at, expires_at, source_coach_id, coach_share_tomans, admin_share_tomans, authority, created_at)
     VALUES ($1, 'monthly', $2, 'active', $3, $4, $5, $6, $7, $8, $3)`,
    [userId, row.amount_tomans, startedAt, periodEnd, row.source_coach_id, coachShare, adminShare, row.authority]
  );
  const state = await subscriptionState(db, userId, now);
  return {
    success: true,
    message: 'رسید واریزی تأیید شد و اشتراک هوشمند شما فعال شد.',
    state,
  };
}

export interface SubscriptionShare {
  id: number;
  studentName: string;
  amountTomans: number;
  coachShareTomans: number;
  createdAt: string;
  expiresAt: string;
}

/** The referral shares a coach earned from the subscriptions of the students they referred. */
export async function listCoachSubscriptionShares(db: Db, coachId: number): Promise<SubscriptionShare[]> {
  const rows = await db.query<{
    id: number;
    display_name: string;
    amount_tomans: number;
    coach_share_tomans: number;
    created_at: string;
    expires_at: string;
  }>(
    `SELECT s.id, u.display_name, s.amount_tomans, s.coach_share_tomans, s.created_at, s.expires_at
     FROM subscriptions s JOIN users u ON u.id = s.user_id
     WHERE s.source_coach_id = $1 AND s.status = 'active' AND s.coach_share_tomans > 0
     ORDER BY s.id DESC`,
    [coachId]
  );
  return rows.map((row) => ({
    id: row.id,
    studentName: row.display_name,
    amountTomans: row.amount_tomans,
    coachShareTomans: row.coach_share_tomans,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}
