import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { faNumber } from '../lib/format';
import { getAssignedMeta, type AssignedMeta } from '../lib/programStore';

type Checkout = { simulation: true; authority: string; amountTomans: number; expiresAt: string };
type Result = { simulation: true; success: boolean; amountTomans: number; expiresAt: string };

/** Exercises the test checkout, never the real gateway or real transaction ledger. */
export function StudentTestPurchase({ program }: { program: AssignedMeta }) {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [outcome, setOutcome] = useState<'canceled' | 'needs-refresh' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await api<Checkout>('POST', '/pay/test/start', { expectedId: program.id, expectedVersion: program.version });
      if (result.simulation !== true || !/^TEST-[a-f0-9-]{36}$/.test(result.authority) || !Number.isSafeInteger(result.amountTomans) || result.amountTomans <= 0) {
        throw new Error('Invalid test checkout');
      }
      setCheckout(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'خرید آزمایشی شروع نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function finish(result: 'success' | 'cancel') {
    if (!checkout) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<Result>('POST', '/pay/test/confirm', { authority: checkout.authority, result });
      if (response.simulation !== true || typeof response.success !== 'boolean') throw new Error('Invalid test result');
      if (response.success) {
        await loadAssignedProgram();
        if (!getAssignedMeta()?.isTestPurchase) setOutcome('needs-refresh');
      } else {
        setCheckout(null);
        setOutcome('canceled');
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'نتیجهٔ خرید آزمایشی ثبت نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="payment-practice student-test-purchase" aria-label="خرید آزمایشی برنامه">
      <div className="payment-practice__content">
        <strong>خرید آزمایشی برنامه</strong>
        <p>مربی اجازهٔ این آزمایش را داده است. پول واقعی پرداخت نمی‌شود؛ پس از تأیید، برنامه فقط به‌طور موقت و آزمایشی باز می‌شود.</p>
        <p>این خرید واقعی نیست. تمرین‌هایی که در حساب خود ثبت کنید مانند سایر داده‌های حساب ذخیره می‌شوند.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {outcome === 'canceled' && <p role="status">خرید آزمایشی لغو شد؛ برنامه همچنان قفل است.</p>}
        {outcome === 'needs-refresh' ? (
          <>
            <p role="status">خرید آزمایشی تأیید شد؛ برای بارگذاری برنامه دوباره تلاش کنید.</p>
            <button type="button" className="button button--secondary" disabled={busy} onClick={() => void loadAssignedProgram()}>بارگذاری دوبارهٔ برنامه</button>
          </>
        ) : checkout ? (
          <div className="payment-practice__result">
            <strong>درگاه شبیه‌سازی‌شده؛ بدون انتقال پول</strong>
            <p>مبلغ نمایشی: {faNumber(checkout.amountTomans)} تومان</p>
            <div className="payment-practice__actions">
              <button type="button" className="button button--primary" disabled={busy} onClick={() => void finish('success')}>تأیید خرید آزمایشی</button>
              <button type="button" className="button button--ghost" disabled={busy} onClick={() => void finish('cancel')}>انصراف از خرید آزمایشی</button>
            </div>
          </div>
        ) : (
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => void start()}>{busy ? 'در حال آماده‌سازی…' : 'شروع خرید آزمایشی'}</button>
        )}
      </div>
    </section>
  );
}
