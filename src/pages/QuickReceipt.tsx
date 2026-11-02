import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardPaste, CreditCard, Landmark, Receipt } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, isReviewQueued } from '../lib/api';
import { faNumber } from '../lib/format';

interface PendingRequest {
  authority: string;
  amountTomans: number;
  transferAmountTomans: number | null;
  reference: string | null;
  trackingNumber: string | null;
  status: string;
  createdAt: string;
  expiresAt: string;
  cardNumber: string;
  cardHolder: string;
  bankName: string;
}

function groupedCardNumber(value: string): string {
  return value.replace(/(.{4})/g, '$1 ').trim();
}

/**
 * The quick path of the receipt: the student opens this screen after the transfer and
 * pastes the tracking number of the bank receipt. The programme opens when the money is
 * really there: the bank service confirms it, or a manager matches it in the statement.
 */
export function QuickReceipt() {
  const [request, setRequest] = useState<PendingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [senderCardLast4, setSenderCardLast4] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const result = await api<{ pending: boolean; request: PendingRequest | null }>('GET', '/pay/card-transfer/pending');
      setRequest(result.request ?? null);
      if (result.request?.trackingNumber && !trackingNumber) setTrackingNumber(result.request.trackingNumber);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'وضعیت پرداخت بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  }, [trackingNumber]);

  useEffect(() => {
    void load();
  }, []);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setTrackingNumber(text.trim());
      setError(null);
    } catch {
      setError('خواندن از حافظه ممکن نشد؛ شمارهٔ پیگیری را دستی بچسبانید.');
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ success: boolean; message: string }>('POST', '/pay/card-transfer/receipt', {
        authority: request.authority,
        trackingNumber: trackingNumber.trim(),
        ...(senderCardLast4.trim() ? { senderCardLast4: senderCardLast4.trim() } : {}),
      });
      if (!response || response.success !== true) {
        throw new ApiError(409, response?.message ?? 'رسید واریزی تأیید نشد.');
      }
      setDone(response.message);
      setTrackingNumber('');
      setSenderCardLast4('');
    } catch (caught) {
      if (isReviewQueued(caught)) {
        // The receipt is written down; the manager still has to see the transfer.
        setWaiting((caught as ApiError).message);
        setTrackingNumber('');
        setSenderCardLast4('');
        await load();
      } else {
        setError(caught instanceof ApiError ? caught.message : 'ثبت رسید ممکن نشد. دوباره تلاش کنید.');
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <section className="panel-card"><p className="account-muted">در حال بررسی وضعیت پرداخت…</p></section>;
  }

  if (waiting) {
    return (
      <section className="panel-card quick-receipt" aria-label="ثبت رسید پرداخت">
        <p className="quick-receipt__waiting" role="status">{waiting}</p>
        <p className="account-muted">به‌محض تأیید مدیر، برنامه باز می‌شود و همین‌جا باخبر می‌شوید.</p>
        <div className="quick-receipt__actions">
          <button type="button" className="button button--ghost" onClick={() => { setWaiting(null); void load(); }}>بررسی دوباره</button>
        </div>
      </section>
    );
  }

  if (done) {
    return (
      <section className="panel-card quick-receipt" aria-label="ثبت رسید پرداخت">
        <p className="form-success" role="status"><Check size={15} /> {done}</p>
        <div className="quick-receipt__actions">
          <button type="button" className="button button--primary" onClick={() => navigate('/program')}>رفتن به برنامه</button>
          <button type="button" className="button button--ghost" onClick={() => { setDone(null); void load(); }}>بررسی دوباره</button>
        </div>
      </section>
    );
  }

  if (!request) {
    return (
      <section className="panel-card quick-receipt" aria-label="ثبت رسید پرداخت">
        <h2><Receipt size={18} /> ثبت رسید پرداخت</h2>
        <p className="account-muted">
          پرداخت بازی کارت‌به‌کارت است. اگر برنامه‌ای برای پرداخت ندارید، از صفحهٔ برنامه شروع کنید.
        </p>
        <Link to="/program" className="button button--primary">رفتن به برنامه</Link>
      </section>
    );
  }

  const amount = request.transferAmountTomans ?? request.amountTomans ?? 0;

  return (
    <section className="panel-card quick-receipt" aria-label="ثبت رسید پرداخت">
      <h2><Receipt size={18} /> ثبت رسید پرداخت</h2>
      <p className="account-muted">
        همین مبلغ را واریز کرده‌اید؟ شمارهٔ پیگیری رسید بانکی را بچسبانید؛ برنامه باز می‌شود.
      </p>

      <div className="quick-receipt__summary">
        <div>
          <span>مبلغ دقیق واریزی</span>
          <b dir="ltr">{faNumber(amount)}</b>
          <small>تومان</small>
        </div>
        <div>
          <span>کارت مقصد</span>
          <b dir="ltr">{groupedCardNumber(request.cardNumber)}</b>
          <small>{request.cardHolder}{request.bankName ? ` — ${request.bankName}` : ''}</small>
        </div>
        {request.reference && (
          <div>
            <span>کد پیگیری درخواست</span>
            <b dir="ltr">{request.reference}</b>
            <small>در توضیحات واریز نوشته شود</small>
          </div>
        )}
      </div>

      {request.trackingNumber && (
        <p className="quick-receipt__waiting">رسید شما ثبت شده و در حال بررسی است. اگر شمارهٔ درست را دارید، دوباره ثبت کنید.</p>
      )}

      <form className="quick-receipt__form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="quick-receipt-tracking">
          <span>شمارهٔ پیگیری رسید</span>
          <input
            id="quick-receipt-tracking"
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
        <button type="button" className="button button--ghost" onClick={() => void paste()}>
          <ClipboardPaste size={15} /> چسباندن
        </button>
        <label htmlFor="quick-receipt-last4">
          <span>چهار رقم آخر کارت مبدأ <small>(اختیاری)</small></span>
          <input
            id="quick-receipt-last4"
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
          <CreditCard size={15} /> {busy ? 'در حال بررسی…' : 'ثبت رسید و بازکردن برنامه'}
        </button>
      </form>

      <p className="account-muted">
        <Landmark size={14} /> اگر رسید را قبلاً ثبت کرده‌اید و برنامه باز نشده، چند دقیقه صبر کنید؛ مدیر باشگاه آن را بررسی می‌کند.
      </p>
    </section>
  );
}
