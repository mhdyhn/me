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
import { adminRecipients, createNotification } from './notifications.ts';
import { planIdForUser, unlockedFeatures, type FeatureKey, type PlanId } from './plans.ts';
import { findUserById } from './users.ts';

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
  /** The plan of this account right now. */
  planId: PlanId;
  /** The features the plan opens. */
  features: FeatureKey[];
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
  const user = await findUserById(db, userId);
  if (!user) throw new HttpError(404, 'حساب یافت نشد.');
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
  const active = Boolean(row);
  const planId = planIdForUser(user, active);
  return {
    priceTomans: subscriptionPriceTomans(),
    planId,
    features: unlockedFeatures(user, active),
    active,
    expiresAt,
    daysLeft,
    referralCoachName: row?.coach_name ?? null,
    cardTransferAvailable: (await cardTransferConfig(db)) !== null,
  };
}

export interface SubscriptionCheckout {
  /** True when a bank verification service confirms the receipt at once. */
  autoConfirm: boolean;
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

function instructionsFor(amount: number, reference: string, autoConfirm: boolean): string[] {
  const money = new Intl.NumberFormat('fa-IR').format(amount);
  return [
    `مبلغ ${money} تومان را دقیقاً به کارت زیر واریز کنید.`,
    `در توضیحات واریز، کد پیگیری «${reference}» را بنویسید.`,
    'پس از واریز، شمارهٔ پیگیری رسید را در همین صفحه ثبت کنید.',
    autoConfirm
      ? 'رسید شما با سرویس بانکی بررسی و اشتراک فعال می‌شود.'
      : 'رسید شما در صف بررسی مدیر می‌نشیند و اشتراک پس از تأیید واریز فعال می‌شود.',
  ];
}

/**
 * Starts the card-to-card purchase of one subscription month.
 * An unfinished request is reused, so the student is never asked to pay twice.
 */
export async function createSubscriptionCheckout(db: Db, userId: number, now = new Date()): Promise<SubscriptionCheckout> {
  const config = await cardTransferConfig(db);
  if (!config) {
    throw new HttpError(503, 'خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.');
  }
  const state = await subscriptionState(db, userId, now);
  if (state.active) {
    throw new HttpError(409, 'اشتراک شما فعال است؛ تا پایان این دوره نیازی به خرید دوباره نیست.');
  }
  if (state.planId === 'coach') {
    throw new HttpError(409, 'شما پلن «همراه مربی» را دارید؛ برنامهٔ تمرینی و غذایی مربی برایتان باز است و اشتراک لازم نیست.');
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
        autoConfirm: Boolean(config.verifyUrl),
        instructions: instructionsFor(pending.transfer_amount_tomans, pending.reference, Boolean(config.verifyUrl)),
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
      autoConfirm: Boolean(config.verifyUrl),
      instructions: instructionsFor(existing.transfer_amount_tomans, existing.reference, Boolean(config.verifyUrl)),
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
    autoConfirm: Boolean(config.verifyUrl),
    instructions: instructionsFor(transferAmount, reference, Boolean(config.verifyUrl)),
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
  const config = await cardTransferConfig(db);
  if (!config) throw new HttpError(503, 'خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.');
  if (config.verifyUrlError) {
    throw new HttpError(503, 'سرویس بررسی خودکار رسید درست تنظیم نشده است؛ با پشتیبانی تماس بگیرید.');
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
  const verification = await verifyWithProvider(config, {
    authority: row.authority,
    trackingNumber,
    amountTomans: row.transfer_amount_tomans,
    reference: row.reference,
  });
  if (verification !== 'verified') {
    // The receipt is kept on the request: a manager matches it in the bank statement and
    // settles it with one tap. A made-up reference can never open a subscription.
    await db.query(
      `UPDATE subscription_payments SET tracking_number = $1, sender_card_last4 = $2 WHERE id = $3 AND status = 'pending'`,
      [trackingNumber, senderLast4, row.id]
    );
    for (const adminId of await adminRecipients(db)) {
      await createNotification(db, adminId, {
        kind: 'payment',
        title: 'رسید اشتراک در انتظار بررسی',
        body: `${row.authority} — مبلغ ${row.amount_tomans.toLocaleString('fa-IR')} تومان`,
        link: '/coach/admin/transactions',
      }, now);
    }
    await createNotification(db, userId, {
      kind: 'payment',
      title: 'رسید اشتراک شما ثبت شد و در حال بررسی است',
      body: 'به‌محض بررسی، اشتراک شما فعال می‌شود.',
      link: '/progress',
    }, now);
    throw new HttpError(409, verification === 'no_service'
      ? 'رسید واریزی ثبت شد و در صف بررسی است. پس از دیدنِ واریز در صورت‌حساب، اشتراک شما فعال می‌شود.'
      : 'رسید واریزی در سرویس بررسی بانکی تأیید نشد؛ شمارهٔ پیگیری را بررسی کنید یا با پشتیبانی تماس بگیرید.');
  }

  const state = await settleSubscriptionPayment(db, userId, row, trackingNumber, senderLast4, now);
  return {
    success: true,
    message: 'رسید واریزی تأیید شد و اشتراک هوشمند شما فعال شد.',
    state,
  };
}

interface SettleableSubscriptionPayment {
  id: number;
  amount_tomans: number;
  source_coach_id: number | null;
  authority: string;
}

/**
 * Turns a paid subscription request into an active month.
 *
 * Only one request may claim this payment. The same receipt that arrives twice at the same
 * moment must not open two months of subscription and pay the coach twice.
 */
async function settleSubscriptionPayment(
  db: Db,
  userId: number,
  payment: SettleableSubscriptionPayment,
  trackingNumber: string,
  senderCardLast4: string | null,
  now: Date
): Promise<SubscriptionState> {
  const coachShare = payment.source_coach_id ? referralShareTomans(payment.amount_tomans) : 0;
  const adminShare = payment.amount_tomans - coachShare;
  const startedAt = now.toISOString();
  const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 86_400_000).toISOString();
  const claimed = await db.query<{ id: number }>(
    `UPDATE subscription_payments SET status = 'paid', tracking_number = $1, sender_card_last4 = $2, confirmed_at = $3
     WHERE id = $4 AND status = 'pending' RETURNING id`,
    [trackingNumber, senderCardLast4, startedAt, payment.id]
  );
  if (!claimed.length) {
    // Another request confirmed the same transfer a moment earlier. Its subscription row
    // may still be on its way, so we wait a moment for it.
    return waitForSubscription(db, userId, payment.authority, now);
  }
  await db.query(
    `INSERT INTO subscriptions
     (user_id, plan, amount_tomans, status, started_at, expires_at, source_coach_id, coach_share_tomans, admin_share_tomans, authority, created_at)
     VALUES ($1, 'monthly', $2, 'active', $3, $4, $5, $6, $7, $8, $3)`,
    [userId, payment.amount_tomans, startedAt, periodEnd, payment.source_coach_id, coachShare, adminShare, payment.authority]
  );
  return subscriptionState(db, userId, now);
}

/**
 * The manager settles a subscription receipt that the automatic check could not close.
 * The receipt is only trusted when the money really arrived in the bank statement.
 */
export async function reviewSubscriptionPayment(
  db: Db,
  authority: string,
  action: 'confirm' | 'reject',
  now = new Date()
): Promise<{ success: boolean; message: string; state: SubscriptionState }> {
  const rows = await db.query<{
    id: number;
    user_id: number;
    amount_tomans: number;
    source_coach_id: number | null;
    status: string;
    tracking_number: string | null;
    sender_card_last4: string | null;
  }>(
    'SELECT id, user_id, amount_tomans, source_coach_id, status, tracking_number, sender_card_last4 FROM subscription_payments WHERE authority = $1',
    [authority]
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'درخواست خرید اشتراک یافت نشد.');
  if (row.status === 'paid') {
    return { success: true, message: 'این پرداخت پیش‌تر تأیید شده است.', state: await subscriptionState(db, row.user_id, now) };
  }
  if (row.status !== 'pending') {
    throw new HttpError(409, 'این درخواست دیگر در انتظار بررسی نیست.');
  }
  if (action === 'confirm') {
    const state = await settleSubscriptionPayment(
      db, row.user_id,
      { id: row.id, amount_tomans: row.amount_tomans, source_coach_id: row.source_coach_id, authority },
      row.tracking_number ?? `MANUAL-${authority}`,
      row.sender_card_last4 ?? null,
      now
    );
    await createNotification(db, row.user_id, {
      kind: 'payment',
      title: 'رسید اشتراک شما تأیید شد',
      body: 'اشتراک ماهانهٔ شما فعال شد.',
      link: '/progress',
    }, now);
    return { success: true, message: 'رسید با بررسی پشتیبانی تأیید شد و اشتراک فعال شد.', state };
  }
  await db.query("UPDATE subscription_payments SET status = 'canceled' WHERE id = $1 AND status = 'pending'", [row.id]);
  await createNotification(db, row.user_id, {
    kind: 'payment',
    title: 'رسید اشتراک شما تأیید نشد',
    body: 'اگر فکر می‌کنید اشتباه شده، دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.',
    link: '/progress',
  }, now);
  return { success: false, message: 'رسید رد شد و پرداخت لغو گردید.', state: await subscriptionState(db, row.user_id, now) };
}

/** Waits a short moment for the subscription of a payment that another request has confirmed. */
async function waitForSubscription(db: Db, userId: number, authority: string, now: Date): Promise<SubscriptionState> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const rows = await db.query('SELECT 1 FROM subscriptions WHERE user_id = $1 AND authority = $2 LIMIT 1', [userId, authority]);
    if (rows.length) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return subscriptionState(db, userId, now);
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
