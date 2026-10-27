// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from './db.ts';
import { calculateCommission, createPaymentRequest, isProgramPaid, verifyPayment } from './payments.ts';

const record = {
  id: 1, student_id: 7, student_name: 'شاگرد', coach_id: 3, coach_name: 'مربی',
  amount_tomans: 100000, coach_share_tomans: 90000, admin_share_tomans: 10000,
  authority: 'A00000000000000000000000000012345678', status: 'pending',
  ref_id: null as string | null, card_pan: null, created_at: '2026-10-01T00:00:00Z', verified_at: null,
  gateway_mode: 'legacy',
};

function fakeDb(transaction = record) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT u.coach_id')) return [{ coach_id: 3, price_tomans: 100000, coach_iban: null, coach_name: 'مربی' }];
    if (sql.includes('SELECT id FROM payment_transactions')) return [];
    if (sql.includes('SELECT t.*')) return [{ ...transaction }];
    return [];
  });
  return { db: { query, exec: vi.fn(), close: vi.fn() } as unknown as Db, query };
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('ZARINPAL_MERCHANT_ID', '');
  vi.stubEnv('ZARINPAL_SANDBOX', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('production payment fail-closed policy', () => {
  it('does not create a simulated payment without a merchant id', async () => {
    const { db, query } = fakeDb();
    await expect(createPaymentRequest(db, 7, 'https://example.com')).rejects.toMatchObject({ status: 503 });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO payment_transactions'))).toBe(false);
  });

  it('rejects sandbox configuration even if a merchant is present in production', async () => {
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    vi.stubEnv('ZARINPAL_SANDBOX', 'true');
    await expect(createPaymentRequest(fakeDb().db, 7, 'https://example.com')).rejects.toMatchObject({ status: 503 });
  });

  it('does not fall back to a fake payment after a gateway network failure', async () => {
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('gateway offline')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, query } = fakeDb();
    await expect(createPaymentRequest(db, 7, 'https://example.com')).rejects.toMatchObject({ status: 502 });
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO payment_transactions'))).toBe(false);
  });

  it('does not accept a paid sandbox record copied into production', async () => {
    const { db, query } = fakeDb({ ...record, gateway_mode: 'sandbox', status: 'paid' });
    await expect(verifyPayment(db, record.authority, 'OK')).rejects.toMatchObject({ status: 503 });
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE payment_transactions'))).toBe(false);
  });

  it('verifies old authorities with the real gateway rather than trusting their prefix', async () => {
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    const gateway = vi.fn().mockRejectedValue(new Error('gateway offline'));
    vi.stubGlobal('fetch', gateway);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, query } = fakeDb();
    await expect(verifyPayment(db, record.authority, 'OK')).rejects.toMatchObject({ status: 502 });
    expect(gateway).toHaveBeenCalledOnce();
    expect(query.mock.calls.some(([sql]) => sql.includes("status = 'paid'"))).toBe(false);
  });

  it('requires a reference number before marking a live payment paid', async () => {
    vi.stubEnv('ZARINPAL_MERCHANT_ID', 'real-merchant');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { code: 100 } }), { status: 200 })));
    const { db, query } = fakeDb({ ...record, gateway_mode: 'live' });
    const result = await verifyPayment(db, record.authority, 'OK');
    expect(result.success).toBe(false);
    expect(result.transaction.status).toBe('failed');
    expect(query.mock.calls.some(([sql]) => sql.includes("status = 'paid'"))).toBe(false);
  });

  it('excludes sandbox transactions and legacy sandbox references from production entitlements', async () => {
    const { db, query } = fakeDb();
    expect(await isProgramPaid(db, 7)).toBe(false);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("gateway_mode <> 'sandbox'");
    expect(sql).toContain("NOT LIKE 'SANDBOX-%'");
    expect(sql).toContain('ref_id IS NOT NULL');
    expect(sql).toContain("NOT IN ('undefined', 'null')");
    expect(params).toEqual([7, 1]);
  });

  it('allows explicit non-production simulation with a unique sandbox identifier', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { db, query } = fakeDb();
    const first = await createPaymentRequest(db, 7, 'http://localhost:5173');
    const second = await createPaymentRequest(db, 7, 'http://localhost:5173');
    expect(first.authority).toMatch(/^SANDBOX-/);
    expect(first.authority).not.toBe(second.authority);
    const inserts = query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO payment_transactions')) as unknown as [string, unknown[]][];
    expect(inserts[0]?.[1][7]).toBe('sandbox');
  });

  it('rejects an invalid commission instead of recording negative or NaN shares', () => {
    for (const invalid of ['', '-1', '101', 'not-a-number']) {
      vi.stubEnv('COACH_COMMISSION_PERCENT', invalid);
      expect(() => calculateCommission(100000)).toThrow(/درصد سهم مربی/);
    }
    vi.stubEnv('COACH_COMMISSION_PERCENT', '90');
    expect(calculateCommission(101)).toEqual({ coachShare: 90, adminShare: 11 });
  });

  it('does not treat a legacy paid row without a valid reference as verified', async () => {
    for (const refId of [null, '', 'undefined', 'null']) {
      const { db } = fakeDb({ ...record, status: 'paid', ref_id: refId });
      await expect(verifyPayment(db, record.authority, 'OK')).rejects.toMatchObject({ status: 503 });
    }
  });
});
