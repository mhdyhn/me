import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Check, X } from 'lucide-react';
import { faNumber } from '../../lib/format';

export function SandboxPay() {
  const [params] = useSearchParams();
  const authority = params.get('Authority') || params.get('authority') || '';
  const amount = Number(params.get('Amount') || params.get('amount') || 0);

  function handleSuccess() {
    window.location.href = `/payment/result?Authority=${encodeURIComponent(authority)}&Status=OK`;
  }

  function handleCancel() {
    window.location.href = `/payment/result?Authority=${encodeURIComponent(authority)}&Status=NOK`;
  }

  return (
    <div className="account-shell" style={{ maxWidth: 480, margin: '2.5rem auto', padding: '1rem' }}>
      <div
        className="panel-card"
        style={{
          border: '1px solid #eab308',
          background: '#fff',
          padding: '2rem 1.5rem',
          display: 'grid',
          gap: '1.25rem',
          borderRadius: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#684b10' }}>
          <ShieldCheck size={28} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: '#684b10' }}>شبیه‌ساز درگاه پرداخت زرین‌پال (Sandbox)</h2>
            <small style={{ color: '#684b10' }}>محیط آزمایش پرداخت بدون کسر پول واقعی</small>
          </div>
        </div>

        <div style={{ background: 'var(--surface-soft)', padding: '1rem', borderRadius: 12, border: '1px solid var(--line)', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="account-muted">مبلغ تراکنش:</span>
            <strong style={{ fontSize: 16, color: 'var(--text)' }}>{faNumber(amount)} تومان</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className="account-muted">شناسه مرجع (Authority):</span>
            <code style={{ fontSize: 11, color: 'var(--text)', overflowWrap: 'anywhere', textAlign: 'left' }}>{authority}</code>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>
          این صفحه برای بررسی و تست جریان خرید، تسهیم ۹۰/۱۰ و بازگشایی خودکار برنامه طراحی شده است. می‌توانید نتیجهٔ دلخواه خود را برای آزمودن سیستم انتخاب کنید:
        </p>

        <div style={{ display: 'grid', gap: 10 }}>
          <button
            type="button"
            className="button button--primary"
            style={{ width: '100%', justifyContent: 'center', fontSize: 15, padding: '12px' }}
            onClick={handleSuccess}
          >
            <Check size={18} /> تأیید و پرداخت آزمایشی (موفق)
          </button>
          <button
            type="button"
            className="button button--ghost"
            style={{ width: '100%', justifyContent: 'center', color: '#a52d31' }}
            onClick={handleCancel}
          >
            <X size={18} /> انصراف از پرداخت (لغو)
          </button>
        </div>
      </div>
    </div>
  );
}
