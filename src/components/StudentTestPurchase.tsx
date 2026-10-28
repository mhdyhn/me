import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { faNumber } from '../lib/format';
import { getAssignedMeta, type AssignedMeta } from '../lib/programStore';
import { confirmModal } from './ConfirmModal';

type Checkout = { simulation: true; authority: string; amountTomans: number; expiresAt: string };
type Result = { simulation: true; success: boolean; amountTomans: number; expiresAt: string };

/** The regular purchase action in test mode skips the bank, not the financial simulation. */
export function StudentTestPurchase({ program }: { program: AssignedMeta }) {
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [outcome, setOutcome] = useState<'canceled' | 'needs-refresh' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(current: Checkout, result: 'success' | 'cancel') {
    const response = await api<Result>('POST', '/pay/test/confirm', { authority: current.authority, result });
    if (response.simulation !== true || typeof response.success !== 'boolean') throw new Error('Invalid test result');
    if (response.success) {
      await loadAssignedProgram();
      if (!getAssignedMeta()?.isTestPurchase) setOutcome('needs-refresh');
    } else {
      setCheckout(null);
      setOutcome('canceled');
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    setOutcome(null);
    let started = false;
    try {
      const current = await api<Checkout>('POST', '/pay/test/start', { expectedId: program.id, expectedVersion: program.version });
      if (current.simulation !== true || !/^TEST-[a-f0-9-]{36}$/.test(current.authority) || !Number.isSafeInteger(current.amountTomans) || current.amountTomans <= 0) {
        throw new Error('Invalid test checkout');
      }
      setCheckout(current);
      started = true;
      const accepted = await confirmModal({
        title: 'تأیید خرید آزمایشی',
        message: `مبلغ آزمایشی ${faNumber(current.amountTomans)} تومان است. پولی پرداخت نمی‌شود؛ نتیجه در گزارش آزمایشی مربی و مدیر ثبت می‌شود و دسترسی موفق موقتی است. ادامه می‌دهید؟`,
        confirmText: 'تأیید و فعال‌سازی آزمایشی', cancelText: 'انصراف', variant: 'warning',
      });
      await finish(current, accepted ? 'success' : 'cancel');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : started ? 'نتیجهٔ خرید آزمایشی ثبت نشد. دوباره تلاش کنید.' : 'خرید آزمایشی شروع نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function retry(result: 'success' | 'cancel') {
    if (!checkout) return;
    setBusy(true);
    setError(null);
    try {
      await finish(checkout, result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'نتیجهٔ خرید آزمایشی ثبت نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="student-test-purchase" aria-label="خرید آزمایشی برنامه">
      <p>حالت آزمایشی فعال است: بدون درگاه و پرداخت پول، با ثبت نتیجه در بخش مالی آزمایشی.</p>
      <p>دسترسی موقتی است؛ تمرین‌هایی که ثبت کنید مانند سایر داده‌های حساب ذخیره می‌شوند.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {outcome === 'canceled' && <p role="status">خرید آزمایشی لغو و در گزارش آزمایشی ثبت شد؛ برنامه همچنان قفل است.</p>}
      {outcome === 'needs-refresh' ? (
        <>
          <p role="status">خرید آزمایشی تأیید شد؛ برای بارگذاری برنامه دوباره تلاش کنید.</p>
          <button type="button" className="button button--secondary" disabled={busy} onClick={() => void loadAssignedProgram()}>بارگذاری دوبارهٔ برنامه</button>
        </>
      ) : checkout && error ? (
        <div className="payment-practice__actions">
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void retry('success')}>تلاش دوباره برای تأیید</button>
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => void retry('cancel')}>لغو خرید آزمایشی</button>
        </div>
      ) : (
        <button type="button" className="button button--primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'در حال ثبت خرید آزمایشی…' : `خرید و فعال‌سازی آزمایشی (${faNumber(program.priceTomans)} تومان)`}
        </button>
      )}
    </section>
  );
}
