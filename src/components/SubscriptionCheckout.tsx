import { useState } from 'react';
import { Check, Copy, CreditCard, Landmark, Sparkles } from 'lucide-react';
import { ApiError } from '../lib/api';
import { faNumber } from '../lib/format';
import {
  startSubscriptionCheckout,
  submitSubscriptionReceipt,
  type SubscriptionCheckoutDetails,
  type SubscriptionState,
} from '../lib/subscription';

function groupedCardNumber(value: string): string {
  return value.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Buying the optional student subscription with card-to-card. The receipt is confirmed by
 * the server automatically; there is no test mode and no fake payment.
 */
export function SubscriptionCheckout({
  priceTomans,
  onActivated,
}: {
  priceTomans: number;
  onActivated?: (state: SubscriptionState) => void;
}) {
  const [details, setDetails] = useState<SubscriptionCheckoutDetails | null>(null);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [senderCardLast4, setSenderCardLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDetails(await startSubscriptionCheckout());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'شروع خرید اشتراک ممکن نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  async function copyCardNumber() {
    if (!details) return;
    try {
      await navigator.clipboard.writeText(details.cardNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('کپی شمارهٔ کارت ممکن نشد؛ شماره را دستی یادداشت کنید.');
    }
  }

  async function submitReceipt(event: React.FormEvent) {
    event.preventDefault();
    if (!details) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitSubscriptionReceipt(details.authority, trackingNumber.trim(), senderCardLast4.trim() || undefined);
      setDone(result.message);
      setTrackingNumber('');
      setSenderCardLast4('');
      onActivated?.(result.state);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ثبت رسید ممکن نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card-transfer card-transfer--active" aria-label="خرید اشتراک">
        <p className="form-success" role="status"><Check size={14} /> {done}</p>
      </section>
    );
  }

  if (!details) {
    return (
      <section className="card-transfer" aria-label="خرید اشتراک">
        <p className="account-muted">
          اشتراک ماهانهٔ هوشمند: {faNumber(priceTomans)} تومان. با کارت‌به‌کارت بپردازید و رسید را ثبت کنید؛
          تأیید رسید خودکار است و امکانات هوشمند بلافاصله باز می‌شود.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void start()}>
          <CreditCard size={15} /> {busy ? 'در حال آماده‌سازی…' : 'پرداخت کارت‌به‌کارت'}
        </button>
      </section>
    );
  }

  return (
    <section className="card-transfer card-transfer--active" aria-label="خرید اشتراک">
      <header className="card-transfer__head">
        <Landmark size={16} />
        <strong>پرداخت کارت‌به‌کارت اشتراک</strong>
      </header>

      <div className="card-transfer__grid">
        <div className="card-transfer__cell">
          <span>مبلغ دقیق واریزی</span>
          <b dir="ltr">{faNumber(details.transferAmountTomans)}</b>
          <small>تومان — همین مبلغ را واریز کنید</small>
        </div>
        <div className="card-transfer__cell">
          <span>شمارهٔ کارت مقصد</span>
          <b dir="ltr">{groupedCardNumber(details.cardNumber)}</b>
          <small>{details.cardHolder}</small>
        </div>
        <div className="card-transfer__cell">
          <span>کد پیگیری</span>
          <b dir="ltr">{details.reference}</b>
          <small>در توضیحات واریز بنویسید</small>
        </div>
      </div>

      <ol className="card-transfer__steps">
        {details.instructions.map((step) => <li key={step}>{step}</li>)}
      </ol>

      <button type="button" className="card-transfer__copy" onClick={() => void copyCardNumber()}>
        {copied ? <><Check size={14} /> شمارهٔ کارت کپی شد</> : <><Copy size={14} /> کپی شمارهٔ کارت</>}
      </button>

      <form className="card-transfer__form" onSubmit={(event) => void submitReceipt(event)}>
        <label className="field-control">
          <span>شمارهٔ پیگیری رسید</span>
          <input
            dir="ltr"
            value={trackingNumber}
            onChange={(event) => setTrackingNumber(event.target.value)}
            inputMode="numeric"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            required
            placeholder="مثلاً 123456789012"
          />
        </label>
        <label className="field-control">
          <span>چهار رقم آخر کارت مبدأ <small>(اختیاری)</small></span>
          <input
            dir="ltr"
            value={senderCardLast4}
            onChange={(event) => setSenderCardLast4(event.target.value.replace(/[^0-9۰-۹٠-٩]/g, '').slice(0, 4))}
            inputMode="numeric"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={4}
            placeholder="1234"
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary" disabled={busy || trackingNumber.trim().length < 4}>
          {busy ? 'در حال بررسی رسید…' : 'ثبت رسید و فعال‌سازی اشتراک'}
        </button>
      </form>
      <p className="card-transfer__note">
        <Sparkles size={13} /> این پرداخت واقعی است؛ مبلغ در گزارش مالی ثبت می‌شود و اشتراک شما پس از تأیید رسید باز می‌شود.
      </p>
    </section>
  );
}
