import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Receipt, X } from 'lucide-react';
import { CollapsiblePanel } from '../../components/CollapsiblePanel';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';

interface CardTransferRequest {
  /** 'program' is a sold programme, 'subscription' is a monthly subscription. */
  kind: 'program' | 'subscription';
  id: number;
  authority: string;
  studentId: number;
  studentName: string;
  coachName: string;
  amountTomans: number;
  transferAmountTomans: number | null;
  reference: string | null;
  trackingNumber: string | null;
  senderLast4: string | null;
  status: string;
  confirmedBy: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * The card-transfer receipts of the club.
 *
 * A receipt the automatic check could not settle waits here; the manager confirms it with
 * one tap and the programme of the student opens at once.
 */
export function AdminCardTransferReceipts() {
  const [requests, setRequests] = useState<CardTransferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ requests: CardTransferRequest[] }>('GET', '/admin/card-transfer/receipts');
      setRequests(result.requests ?? []);
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'رسیدها بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(authority: string, action: 'confirm' | 'reject') {
    setBusy(authority);
    setError(null);
    try {
      await api('POST', '/admin/card-transfer/review', { authority, action });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'بررسی رسید ممکن نشد.');
    } finally {
      setBusy(null);
    }
  }

  // Only the receipts that wait for a decision are worth the space in the title.
  const waiting = requests.filter((item) => item.status === 'pending' && Boolean(item.trackingNumber)).length;

  return (
    <CollapsiblePanel
      title="رسیدهای کارت‌به‌کارت"
      subtitle="رسیدِ بررسی‌نشده با یک کلیک تأیید یا رد می‌شود"
      icon={<Receipt size={18} />}
      headingId="admin-card-transfer-receipts-heading"
      badge={waiting > 0 ? faNumber(waiting) : undefined}
    >
      <p className="account-muted">
        رسیدی که بررسی خودکار نتوانسته ببندد، اینجا می‌نشیند؛ با یک کلیک تأیید یا رد می‌شود و شاگرد باخبر می‌شود.
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="account-muted">در حال بارگذاری رسیدها…</p>}
      {!loading && requests.length === 0 && <p className="account-muted">هنوز پرداخت کارت‌به‌کارتی ثبت نشده است.</p>}

      <div className="admin-card-transfer-receipts__list">
        {requests.map((item) => {
          const needsReview = item.status === 'pending' && Boolean(item.trackingNumber);
          return (
            <article key={item.id} className="admin-card-transfer-receipts__item">
              <div>
                <strong>{item.studentName}</strong>
                <span className="account-muted">
                  {item.kind === 'subscription' ? 'اشتراک ماهانه' : 'برنامهٔ تمرینی'}
                  {item.coachName ? ` · مربی: ${item.coachName}` : ''}
                </span>
                <span className="account-muted">
                  {faNumber(item.transferAmountTomans ?? item.amountTomans ?? 0)} تومان · {dateLabel(item.createdAt)}
                </span>
                {item.reference && <span className="account-muted">کد درخواست: <code dir="ltr">{item.reference}</code></span>}
                {item.trackingNumber && (
                  <span className="account-muted">
                    شمارهٔ پیگیری: <code dir="ltr">{item.trackingNumber}</code>
                    {item.senderLast4 ? ` · کارت مبدأ: ${item.senderLast4}` : ''}
                  </span>
                )}
              </div>
              <div className="admin-card-transfer-receipts__actions">
                {needsReview ? (
                  <>
                    <button type="button" className="button button--small button--primary" disabled={busy === item.authority} onClick={() => void review(item.authority, 'confirm')}>
                      {busy === item.authority ? <Loader2 size={14} className="spin" /> : <Check size={14} />} تأیید رسید
                    </button>
                    <button type="button" className="button button--small button--ghost" disabled={busy === item.authority} onClick={() => void review(item.authority, 'reject')}>
                      <X size={14} /> رد
                    </button>
                  </>
                ) : (
                  <span className="badge">
                    {item.status === 'paid' ? 'تأییدشده' : item.status === 'expired' ? 'منقضی' : item.status === 'canceled' ? 'لغوشده' : 'در انتظار واریز'}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </CollapsiblePanel>
  );
}
