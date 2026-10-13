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
          background: '#141410',
          padding: '2rem 1.5rem',
          display: 'grid',
          gap: '1.25rem',
          borderRadius: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#facc15' }}>
          <ShieldCheck size={28} />
          <div>
            <h2 style={{ margin: 0, fontSize: 17, color: '#fef08a' }}>شبیه‌ساز درگاه پرداخت زرین‌پال (Sandbox)</h2>
            <small style={{ color: '#ca8a04' }}>محیط آزمایش پرداخت بدون کسر پول واقعی</small>
          </div>
        </div>

        <div style={{ background: '#1c1c16', padding: '1rem', borderRadius: 12, border: '1px solid #2d2a1e', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span className="account-muted">مبلغ تراکنش:</span>
            <strong style={{ fontSize: 16, color: 'var(--text)' }}>{faNumber(amount)} تومان</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="account-muted">شناسه مرجع (Authority):</span>
            <code style={{ fontSize: 11, color: '#a1a1aa' }}>{authority}</code>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 13, color: '#d4d4d8', lineHeight: 1.6 }}>
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
            style={{ width: '100%', justifyContent: 'center', color: '#f87171' }}
            onClick={handleCancel}
          >
            <X size={18} /> انصراف از پرداخت (لغو)
          </button>
        </div>
      </div>
    </div>
  );
}
