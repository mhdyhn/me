import type { Db } from './db.ts';
import { HttpError } from './http.ts';
import { DEFAULT_PLAN_PRICES, PAID_PLAN_IDS, PLANS, type PlanId } from './plans.ts';

/**
 * The prices of the paid plans.
 *
 * The prices live in the database, so the admin can change them from the panel and the
 * change is effective at once, without a deployment and without touching the
 * environment. The environment variable is only the starting value of a plan that the
 * admin never changed.
 */
export interface PlanPriceRow {
  plan_id: string;
  price_tomans: number;
  updated_at: string | null;
}

/** The lowest and the highest price the admin may set for one plan. */
export const MIN_PLAN_PRICE_TOMANS = 10_000;
export const MAX_PLAN_PRICE_TOMANS = 10_000_000;

/** Creates the table of the plan prices and writes the starting prices. */
export async function migratePlanPrices(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plan_prices (
      plan_id TEXT PRIMARY KEY,
      price_tomans INTEGER NOT NULL,
      updated_at TEXT
    );
  `);
  for (const planId of PAID_PLAN_IDS) {
    await db.query(
      `INSERT INTO plan_prices (plan_id, price_tomans, updated_at)
       VALUES ($1, $2, NULL) ON CONFLICT (plan_id) DO NOTHING`,
      [planId, DEFAULT_PLAN_PRICES[planId]]
    );
  }
}

/**
 * The price of every paid plan.
 *
 * A plan the admin never touched keeps the price from the environment, so the club can
 * set the price in the panel or in the environment, whichever it prefers.
 */
export async function planPrices(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<Record<PlanId, number>> {
  const prices = { ...DEFAULT_PLAN_PRICES };
  const rows = await db.query<PlanPriceRow>('SELECT plan_id, price_tomans, updated_at FROM plan_prices');
  for (const row of rows) {
    if (!PAID_PLAN_IDS.includes(row.plan_id as PlanId)) continue;
    prices[row.plan_id as PlanId] = row.price_tomans;
  }
  // The environment still decides the price of a plan the admin never changed.
  const envPrice = Number((env.SUBSCRIPTION_PRICE_TOMANS ?? '').trim());
  if (Number.isFinite(envPrice) && envPrice >= MIN_PLAN_PRICE_TOMANS && envPrice <= MAX_PLAN_PRICE_TOMANS) {
    const touched = new Set(rows.map((row) => row.plan_id));
    for (const planId of PAID_PLAN_IDS) {
      if (!touched.has(planId)) prices[planId] = Math.floor(envPrice);
    }
  }
  return prices;
}

/** The price of one paid plan; the free plans always cost nothing. */
export async function planPrice(db: Db, planId: PlanId, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  if (!PAID_PLAN_IDS.includes(planId)) return 0;
  const prices = await planPrices(db, env);
  return prices[planId];
}

/** The prices the admin may change, with the plan they belong to. */
export interface EditablePlanPrice {
  id: PlanId;
  title: string;
  tagline: string;
  priceTomans: number;
  features: string[];
  updatedAt: string | null;
}

/** The paid plans and their current prices, for the admin panel and the paywall. */
export async function editablePlanPrices(db: Db, env: NodeJS.ProcessEnv = process.env): Promise<EditablePlanPrice[]> {
  const prices = await planPrices(db, env);
  const rows = await db.query<PlanPriceRow>('SELECT plan_id, price_tomans, updated_at FROM plan_prices');
  const updatedAt = new Map(rows.map((row) => [row.plan_id, row.updated_at]));
  return PAID_PLAN_IDS.map((planId) => {
    const plan = PLANS[planId];
    return {
      id: planId,
      title: plan.title,
      tagline: plan.tagline,
      priceTomans: prices[planId],
      features: plan.features.map((feature) => feature.label),
      updatedAt: updatedAt.get(planId) ?? null,
    };
  });
}

/** Saves the new prices of the paid plans. */
export async function savePlanPrices(
  db: Db,
  input: Record<string, unknown>,
  now = new Date()
): Promise<EditablePlanPrice[]> {
  const updates: { planId: PlanId; price: number }[] = [];
  for (const planId of PAID_PLAN_IDS) {
    const raw = input[planId];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < MIN_PLAN_PRICE_TOMANS || value > MAX_PLAN_PRICE_TOMANS) {
      throw new HttpError(400, `قیمت «${PLANS[planId].title}» باید عددی بین ${MIN_PLAN_PRICE_TOMANS.toLocaleString('fa-IR')} و ${MAX_PLAN_PRICE_TOMANS.toLocaleString('fa-IR')} تومان باشد.`);
    }
    updates.push({ planId, price: value });
  }
  if (!updates.length) {
    throw new HttpError(400, 'قیمت هیچ پلنی ارسال نشد.');
  }
  for (const update of updates) {
    await db.query(
      `INSERT INTO plan_prices (plan_id, price_tomans, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (plan_id) DO UPDATE SET price_tomans = EXCLUDED.price_tomans, updated_at = EXCLUDED.updated_at`,
      [update.planId, update.price, now.toISOString()]
    );
  }
  return editablePlanPrices(db);
}
