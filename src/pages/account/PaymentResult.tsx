import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ArrowRight, RotateCw } from 'lucide-react';
import { api, type PaymentTransaction } from '../../lib/api';
import { faNumber } from '../../lib/format';
import { loadAssignedProgram } from '../../lib/assignedProgram';

export function PaymentResult() {
  const [params] = useSearchParams();
  const authority = params.get('authority') || params.get('Authority') || '';
  const queryStatus = params.get('status') || params.get('Status') || '';

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string>('');
  const [transaction, setTransaction] = useState<PaymentTransaction | null>(null);

  useEffect(() => {
    if (!authority) {
      setLoading(false);
      setSuccess(false);
      setMessage('شناسهٔ تراکنش نامعتبر است.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api<{
          success: boolean;
          message: string;
          transaction: PaymentTransaction;
        }>('POST', '/pay/verify', {
          authority,
          status: queryStatus || 'OK',
        });

        if (cancelled) return;
        setSuccess(res.success);
        setMessage(res.message);
        setTransaction(res.transaction);
        if (res.success) {
          void loadAssignedProgram();
        }
      } catch {
        if (!cancelled) {
          setSuccess(false);
          setMessage('خطا در بررسی و تأیید وضعیت تراکنش.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authority, queryStatus]);

  return (
    <div className="account-shell" style={{ maxWidth: 520, margin: '2rem auto', padding: '1.5rem' }}>
      <div className="panel-card" style={{ textAlign: 'center', padding: '2rem 1.5rem', display: 'grid', gap: '1.2rem', placeItems: 'center' }}>
        {loading ? (
          <>
            <div style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }}>
              <RotateCw size={40} />
            </div>
            <h2>در حال استعلام وضعیت پرداخت…</h2>
            <p className="account-muted">لطفاً چند لحظه شکیبا باشید.</p>
          </>
        ) : success ? (
          <>
            <div style={{ color: '#4ade80' }}>
              <CheckCircle2 size={56} />
            </div>
            <h2 style={{ margin: 0, color: '#4ade80' }}>پرداخت با موفقیت انجام شد</h2>
            <p style={{ margin: 0 }}>{message}</p>

            {transaction && (
              <div
                style={{
                  width: '100%',
                  background: 'var(--surface-soft)',
                  borderRadius: 14,
                  padding: '1rem',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  gap: 8,
                  textAlign: 'start',
                  fontSize: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="account-muted">مبلغ پرداختی:</span>
                  <strong>{faNumber(transaction.amountTomans)} تومان</strong>
                </div>
                {transaction.refId && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="account-muted">کد پیگیری بانکی:</span>
                    <strong dir="ltr">{transaction.refId}</strong>
                  </div>
                )}
                {transaction.coachName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="account-muted">مربی:</span>
                    <span>{transaction.coachName}</span>
                  </div>
                )}
              </div>
            )}

            <Link to="/program" className="button button--primary" style={{ width: '100%', justifyContent: 'center' }}>
              مشاهده و شروع برنامه تمرینی <ArrowRight size={18} />
            </Link>
          </>
        ) : (
          <>
            <div style={{ color: '#f87171' }}>
              <XCircle size={56} />
            </div>
            <h2 style={{ margin: 0, color: '#f87171' }}>پرداخت ناموفق بود</h2>
            <p className="account-muted" style={{ margin: 0 }}>
              {message || 'پرداخت توسط شما لغو شد یا درگاه بانکی عملیات را تأیید نکرد.'}
            </p>
            {transaction && transaction.amountTomans > 0 && (
              <p className="account-muted" style={{ fontSize: 13, margin: 0 }}>
                مبلغ: {faNumber(transaction.amountTomans)} تومان
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <Link to="/program" className="button button--secondary" style={{ flex: 1, justifyContent: 'center' }}>
                بازگشت به برنامه
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
