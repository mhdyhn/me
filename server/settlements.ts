import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';

// The club pays the coaches by hand: a bank transfer to the IBAN the coach saved.
// What the app can do is keep the book: how much a coach has earned, how much of it
// has been paid, and what is still owed. The transfer itself happens at the bank.

/** One manual transfer of money from the club to a coach. */
export interface CoachSettlement {
  id: number;
  coachId: number;
  amountTomans: number;
  reference: string | null;
  note: string | null;
  paidAt: string;
  createdAt: string;
}

export interface CoachSettlementSummary {
  coachId: number;
  coachName: string;
  iban: string | null;
  /** The share of the coach from the sold programmes. */
  programmeShareTomans: number;
  /** The share of the coach from the subscriptions of the students he referred. */
  referralShareTomans: number;
  earnedTomans: number;
  paidTomans: number;
  owedTomans: number;
  payments: CoachSettlement[];
}

export interface CoachSettlementTotals {
  earnedTomans: number;
  paidTomans: number;
  owedTomans: number;
}

export async function migrateSettlements(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS coach_settlements (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      amount_tomans INTEGER NOT NULL,
      reference TEXT,
      note TEXT,
      paid_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coach_settlements_coach ON coach_settlements(coach_id);
  `);
}

interface SummaryRow {
  coach_id: number;
  display_name: string;
  iban: string | null;
  programme_share: number;
  referral_share: number;
  paid: number;
}

function toSettlement(row: {
  id: number;
  coach_id: number;
  amount_tomans: number;
  reference: string | null;
  note: string | null;
  paid_at: string;
  created_at: string;
}): CoachSettlement {
  return {
    id: row.id,
    coachId: row.coach_id,
    amountTomans: row.amount_tomans,
    reference: row.reference,
    note: row.note,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

/** Every coach who has earned something or has been paid something, with the balance. */
export async function listCoachSettlements(db: Db): Promise<{ settlements: CoachSettlementSummary[]; totals: CoachSettlementTotals }> {
  const rows = await db.query<SummaryRow>(
    `SELECT c.id AS coach_id, c.display_name, c.iban,
            COALESCE(p.programme_share, 0) AS programme_share,
            COALESCE(r.referral_share, 0) AS referral_share,
            COALESCE(s.paid, 0) AS paid
     FROM users c
     LEFT JOIN (
       SELECT coach_id, SUM(coach_share_tomans) AS programme_share
       FROM payment_transactions WHERE status = 'paid' AND coach_share_tomans > 0 GROUP BY coach_id
     ) p ON p.coach_id = c.id
     LEFT JOIN (
       SELECT source_coach_id AS coach_id, SUM(coach_share_tomans) AS referral_share
       FROM subscriptions WHERE source_coach_id IS NOT NULL AND coach_share_tomans > 0 GROUP BY source_coach_id
     ) r ON r.coach_id = c.id
     LEFT JOIN (
       SELECT coach_id, SUM(amount_tomans) AS paid FROM coach_settlements GROUP BY coach_id
     ) s ON s.coach_id = c.id
     WHERE c.role = 'coach'
       AND (COALESCE(p.programme_share, 0) > 0 OR COALESCE(r.referral_share, 0) > 0 OR COALESCE(s.paid, 0) > 0)
     ORDER BY (COALESCE(p.programme_share, 0) + COALESCE(r.referral_share, 0) - COALESCE(s.paid, 0)) DESC, c.id`,
  );
  const paymentRows = await db.query<{
    id: number;
    coach_id: number;
    amount_tomans: number;
    reference: string | null;
    note: string | null;
    paid_at: string;
    created_at: string;
  }>(
    `SELECT id, coach_id, amount_tomans, reference, note, paid_at, created_at
     FROM coach_settlements ORDER BY id DESC`,
  );
  const paymentsByCoach = new Map<number, CoachSettlement[]>();
  for (const row of paymentRows) {
    const list = paymentsByCoach.get(row.coach_id) ?? [];
    list.push(toSettlement(row));
    paymentsByCoach.set(row.coach_id, list);
  }
  const settlements = rows.map((row) => {
    const earned = row.programme_share + row.referral_share;
    const paid = row.paid;
    return {
      coachId: row.coach_id,
      coachName: row.display_name,
      iban: row.iban,
      programmeShareTomans: row.programme_share,
      referralShareTomans: row.referral_share,
      earnedTomans: earned,
      paidTomans: paid,
      owedTomans: earned - paid,
      payments: paymentsByCoach.get(row.coach_id) ?? [],
    };
  });
  const totals = settlements.reduce(
    (acc, row) => ({
      earnedTomans: acc.earnedTomans + row.earnedTomans,
      paidTomans: acc.paidTomans + row.paidTomans,
      owedTomans: acc.owedTomans + row.owedTomans,
    }),
    { earnedTomans: 0, paidTomans: 0, owedTomans: 0 },
  );
  return { settlements, totals };
}

/** The balance of one coach; the same numbers the coach sees on their own page. */
export async function coachSettlementSummary(db: Db, coachId: number): Promise<CoachSettlementSummary | null> {
  const all = await listCoachSettlements(db);
  return all.settlements.find((row) => row.coachId === coachId) ?? null;
}

/** Records a transfer the club made to the coach. The money itself moves at the bank. */
export async function recordCoachSettlement(db: Db, body: unknown, now = new Date()): Promise<CoachSettlement> {
  const input = requireObject(body);
  const coachId = Number(input.coachId);
  if (!Number.isInteger(coachId) || coachId <= 0) throw new HttpError(400, 'مربی را انتخاب کنید.');
  const amountTomans = Number(input.amountTomans);
  if (!Number.isInteger(amountTomans) || amountTomans <= 0) throw new HttpError(400, 'مبلغ پرداخت باید عددِ مثبت باشد.');
  if (amountTomans > 1_000_000_000) throw new HttpError(400, 'مبلغ پرداخت بیش از حدِ مجاز است.');
  const coaches = await db.query<{ id: number; role: string }>('SELECT id, role FROM users WHERE id = $1', [coachId]);
  const coach = coaches[0];
  if (!coach || coach.role !== 'coach') throw new HttpError(404, 'مربی پیدا نشد.');
  const reference = typeof input.reference === 'string' && input.reference.trim() ? input.reference.trim().slice(0, 80) : null;
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  let paidAt = now.toISOString();
  if (typeof input.paidAt === 'string' && input.paidAt.trim()) {
    const parsed = new Date(input.paidAt.trim());
    if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'تاریخ پرداخت نامعتبر است.');
    if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) throw new HttpError(400, 'تاریخ پرداخت نمی‌تواند در آینده باشد.');
    paidAt = parsed.toISOString();
  }
  const rows = await db.query<{
    id: number;
    coach_id: number;
    amount_tomans: number;
    reference: string | null;
    note: string | null;
    paid_at: string;
    created_at: string;
  }>(
    `INSERT INTO coach_settlements (coach_id, amount_tomans, reference, note, paid_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, coach_id, amount_tomans, reference, note, paid_at, created_at`,
    [coachId, amountTomans, reference, note, paidAt, now.toISOString()],
  );
  const created = rows[0];
  if (!created) throw new HttpError(500, 'ثبت پرداخت ممکن نشد.');
  return toSettlement(created);
}
