import { useState } from 'react';
import { Check, Copy, CreditCard, Landmark } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { faNumber } from '../lib/format';
import type { AssignedMeta } from '../lib/programStore';

export interface CardTransferDetails {
  authority: string;
  programmeId: string;
  programmeTitle: string;
  coachName: string;
  priceTomans: number;
  transferAmountTomans: number;
  reference: string;
  cardNumber: string;
  cardHolder: string;
  expiresAt: string;
  instructions: string[];
}

function groupedCardNumber(value: string): string {
  return value.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * Card-to-card payment: the student transfers the exact amount, then submits the bank
 * receipt. The server confirms the receipt automatically and unlocks the programme.
 */
export function CardTransferCheckout({ program }: { program: AssignedMeta }) {
  const [details, setDetails] = useState<CardTransferDetails | null>(null);
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
      const response = await api<CardTransferDetails>('POST', '/pay/card-transfer/start', {
        expectedId: program.id, expectedVersion: program.version,
      });
      if (!response || typeof response.authority !== 'string' || !/^[A-Za-z0-9_-]{5,100}$/.test(response.authority) ||
          !Number.isSafeInteger(response.transferAmountTomans) || response.transferAmountTomans <= 0 ||
          typeof response.cardNumber !== 'string' || !/^\d{16}$/.test(response.cardNumber)) {
        throw new Error('Invalid card transfer checkout');
      }
      setDetails(response);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'شروع پرداخت کارت‌به‌کارت ممکن نشد. دوباره تلاش کنید.');
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
      const response = await api<{ success: boolean; message: string }>('POST', '/pay/card-transfer/receipt', {
        authority: details.authority,
        trackingNumber: trackingNumber.trim(),
        ...(senderCardLast4.trim() ? { senderCardLast4: senderCardLast4.trim() } : {}),
      });
      if (!response || response.success !== true) {
        throw new ApiError(409, response?.message ?? 'رسید واریزی تأیید نشد.');
      }
      setDone(response.message);
      setTrackingNumber('');
      setSenderCardLast4('');
      await loadAssignedProgram();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ثبت رسید ممکن نشد. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section className="card-transfer" aria-label="پرداخت کارت‌به‌کارت">
        <p className="form-success" role="status"><Check size={14} /> {done}</p>
        <button type="button" className="button button--ghost" onClick={() => void loadAssignedProgram()}>بررسی دوبارهٔ وضعیت برنامه</button>
      </section>
    );
  }

  if (!details) {
    return (
      <section className="card-transfer" aria-label="پرداخت کارت‌به‌کارت">
        <p className="account-muted">
          اگر درگاه بانکی برایتان باز نمی‌شود، مبلغ را کارت‌به‌کارت واریز کنید و رسید را همین‌جا ثبت کنید؛
          تأیید رسید خودکار است و برنامه بلافاصله باز می‌شود.
        </p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void start()}>
          <CreditCard size={15} /> {busy ? 'در حال آماده‌سازی…' : 'پرداخت کارت‌به‌کارت'}
        </button>
      </section>
    );
  }

  return (
    <section className="card-transfer card-transfer--active" aria-label="پرداخت کارت‌به‌کارت">
      <header className="card-transfer__head">
        <Landmark size={16} />
        <strong>پرداخت کارت‌به‌کارت</strong>
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
            onChange={(event) => setSenderCardLast4(event.target.value.replace(/[^\d۰-۹٠-٩]/g, '').slice(0, 4))}
            inputMode="numeric"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={4}
            placeholder="1234"
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary" disabled={busy || trackingNumber.trim().length < 4}>
          {busy ? 'در حال بررسی رسید…' : 'ثبت رسید و فعال‌سازی برنامه'}
        </button>
      </form>
      <p className="card-transfer__note">
        این پرداخت واقعی است: مبلغ در گزارش مالی مربی و مدیر ثبت می‌شود و برنامه پس از تأیید رسید باز می‌شود.
      </p>
    </section>
  );
}
