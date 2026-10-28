import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, CreditCard, Save, XCircle } from 'lucide-react';
import { ApiError, api, type PaymentTransaction } from '../../lib/api';
import { PaymentPractice } from '../../components/PaymentPractice';
import { faNumber } from '../../lib/format';
import { PanelPage, RequireRole } from './AccountShell';

export function CoachTransactions() {
  return (
    <RequireRole roles={['coach']}>
      <CoachTransactionsView />
    </RequireRole>
  );
}

function CoachTransactionsView() {
  const [transactions, setTransactions] = useState<PaymentTransaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // IBAN state
  const [iban, setIban] = useState('');
  const [savingIban, setSavingIban] = useState(false);
  const [ibanMessage, setIbanMessage] = useState<string | null>(null);
  const [ibanError, setIbanError] = useState<string | null>(null);

  async function load() {
    try {
      const [txRes, ibanRes] = await Promise.all([
        api<{ transactions: PaymentTransaction[] }>('GET', '/coach/transactions'),
        api<{ iban: string | null }>('GET', '/coach/iban'),
      ]);
      setTransactions(txRes.transactions);
      setIban(ibanRes.iban ?? '');
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'تراکنش‌ها بارگذاری نشدند.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSaveIban(e: FormEvent) {
    e.preventDefault();
    setSavingIban(true);
    setIbanMessage(null);
    setIbanError(null);
    try {
      const res = await api<{ ok: boolean; iban: string }>('PUT', '/coach/iban', { iban });
      setIban(res.iban);
      setIbanMessage('شماره شبا با موفقیت ذخیره شد.');
    } catch (err) {
      setIbanError(err instanceof ApiError ? err.message : 'خطا در ذخیره شماره شبا.');
    } finally {
      setSavingIban(false);
    }
  }

  const paidTransactions = useMemo(() => (transactions ?? []).filter((t) => t.status === 'paid'), [transactions]);
  const totalEarned = useMemo(() => paidTransactions.reduce((sum, t) => sum + t.coachShareTomans, 0), [paidTransactions]);

  return (
    <PanelPage title="تراکنش‌ها و درآمد مربی">
      <Link className="back-link" to="/coach">
        <ArrowRight size={16} /> شاگردها
      </Link>

      <section className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>محیط آزمایشی پرداخت</h3>
        <p className="account-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          برای تمرین با مبلغ دلخواه نیازی به ساخت شاگرد یا تغییر برنامهٔ واقعی نیست. برای بررسی قیمت یک برنامهٔ ذخیره‌شده، شاگرد را انتخاب و برنامهٔ او را باز کنید.
        </p>
        <Link to="/coach" className="button button--secondary">انتخاب شاگرد</Link>
        <PaymentPractice program={null} sample />
      </section>

      {/* IBAN registration card */}
      <section className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} /> شماره شبای تسویه حساب
        </h3>
        <p className="account-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          ثبت شبا به‌تنهایی به معنی واریز وجه نیست. تسهیم و تسویهٔ بانکی باید پس از اتصال درگاه و بررسی قرارداد آن تأیید شوند؛ سهم پیش‌فرض مربی ۹۰٪ است و می‌تواند در تنظیمات سرور تغییر کند.
        </p>
        <form onSubmit={(e) => void onSaveIban(e)} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            aria-label="شماره شبای بانکی"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="IR..."
            dir="ltr"
            maxLength={34}
            style={{ width: 'min(100%, 260px)', minWidth: 0, fontFamily: 'monospace' }}
            required
          />
          <button type="submit" className="button button--primary" disabled={savingIban}>
            <Save size={16} /> {savingIban ? 'در حال ثبت…' : 'ذخیره شبا'}
          </button>
        </form>
        {ibanMessage && <p style={{ color: '#4ade80', fontSize: 13, margin: '8px 0 0' }}>{ibanMessage}</p>}
        {ibanError && <p className="form-error" style={{ margin: '8px 0 0' }}>{ibanError}</p>}
      </section>

      {/* Revenue stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="panel-card" style={{ padding: '1rem', background: 'var(--surface-soft)' }}>
          <span className="account-muted" style={{ fontSize: 13 }}>جمع سهم ثبت‌شده از پرداخت‌های موفق</span>
          <strong style={{ display: 'block', fontSize: 20, color: '#4ade80', marginTop: 4 }}>
            {faNumber(totalEarned)} تومان
          </strong>
        </div>
        <div className="panel-card" style={{ padding: '1rem', background: 'var(--surface-soft)' }}>
          <span className="account-muted" style={{ fontSize: 13 }}>تراکنش‌های موفق</span>
          <strong style={{ display: 'block', fontSize: 20, color: 'var(--text)', marginTop: 4 }}>
            {faNumber(paidTransactions.length)} عدد
          </strong>
        </div>
      </div>

      <p className="account-muted">مبالغ بر اساس سوابق برنامه نمایش داده می‌شوند و تأیید واریز به حساب بانکی نیستند.</p>
      {loadError && <p className="form-error">{loadError}</p>}
      {transactions === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {transactions?.length === 0 && (
        <p className="account-muted">هنوز تراکنشی برای شاگردان شما ثبت نشده است.</p>
      )}

      {transactions && transactions.length > 0 && (
        <TransactionList transactions={transactions} isCoach />
      )}
    </PanelPage>
  );
}

export function AdminTransactions() {
  return (
    <RequireRole roles={['admin']}>
      <AdminTransactionsView />
    </RequireRole>
  );
}

function AdminTransactionsView() {
  const [transactions, setTransactions] = useState<PaymentTransaction[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api<{ transactions: PaymentTransaction[] }>('GET', '/admin/transactions')
      .then((res) => setTransactions(res.transactions))
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'تراکنش‌ها بارگذاری نشدند.'));
  }, []);

  const paidTransactions = useMemo(() => (transactions ?? []).filter((t) => t.status === 'paid'), [transactions]);
  const totalVolume = useMemo(() => paidTransactions.reduce((sum, t) => sum + t.amountTomans, 0), [paidTransactions]);
  const totalAdminShare = useMemo(() => paidTransactions.reduce((sum, t) => sum + t.adminShareTomans, 0), [paidTransactions]);
  const totalCoachShare = useMemo(() => paidTransactions.reduce((sum, t) => sum + t.coachShareTomans, 0), [paidTransactions]);

  return (
    <PanelPage title="تراکنش‌های کل باشگاه">
      <Link className="back-link" to="/coach">
        <ArrowRight size={16} /> مربی‌ها
      </Link>

      <section className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>محیط آزمایشی پرداخت</h3>
        <p className="account-muted">این نمونه مستقل از شاگردها و تراکنش‌های واقعی است.</p>
        <PaymentPractice program={null} sample />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="panel-card" style={{ padding: '1rem' }}>
          <span className="account-muted" style={{ fontSize: 13 }}>کل گردش مالی</span>
          <strong style={{ display: 'block', fontSize: 20, marginTop: 4 }}>
            {faNumber(totalVolume)} تومان
          </strong>
        </div>
        <div className="panel-card" style={{ padding: '1rem' }}>
          <span className="account-muted" style={{ fontSize: 13 }}>سهم ثبت‌شدهٔ باشگاه</span>
          <strong style={{ display: 'block', fontSize: 20, color: 'var(--accent)', marginTop: 4 }}>
            {faNumber(totalAdminShare)} تومان
          </strong>
        </div>
        <div className="panel-card" style={{ padding: '1rem' }}>
          <span className="account-muted" style={{ fontSize: 13 }}>سهم ثبت‌شدهٔ مربیان</span>
          <strong style={{ display: 'block', fontSize: 20, color: '#4ade80', marginTop: 4 }}>
            {faNumber(totalCoachShare)} تومان
          </strong>
        </div>
      </div>

      <p className="account-muted">جمع‌ها از سوابق برنامه هستند و تأیید تسویهٔ بانکی نیستند.</p>
      {loadError && <p className="form-error">{loadError}</p>}
      {transactions === null && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {transactions?.length === 0 && <p className="account-muted">هنوز تراکنشی ثبت نشده است.</p>}

      {transactions && transactions.length > 0 && (
        <TransactionList transactions={transactions} isCoach={false} />
      )}
    </PanelPage>
  );
}

function TransactionList({ transactions, isCoach }: { transactions: PaymentTransaction[]; isCoach: boolean }) {
  return (
    <div className="transaction-list">
      {transactions.map((t) => {
        const isPaid = t.status === 'paid';
        const isCanceled = t.status === 'canceled' || t.status === 'failed';
        const dateStr = new Date(t.createdAt).toLocaleDateString('fa-IR', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        return (
          <article
            key={t.id}
            className="panel-card"
            style={{
              padding: '12px 16px',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div className="transaction-card__identity">
              <div className="transaction-card__names">
                <span style={{ fontWeight: 600 }}>شاگرد: {t.studentName ?? 'شاگرد'}</span>
                {!isCoach && t.coachName && (
                  <span className="badge">مربی: {t.coachName}</span>
                )}
              </div>
              <div className="account-muted transaction-card__meta">
                <span>{dateStr}</span>
                {t.refId && <span>کد پیگیری: <code dir="ltr">{t.refId}</code></span>}
              </div>
            </div>

            <div style={{ textAlign: 'end', display: 'grid', gap: 4 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{faNumber(t.amountTomans)} تومان</strong>
                {isCoach && (
                  <span style={{ display: 'block', fontSize: 12, color: '#4ade80' }}>
                    سهم ثبت‌شدهٔ شما: {faNumber(t.coachShareTomans)} تومان
                  </span>
                )}
              </div>
              <div>
                {isPaid ? (
                  <span className="badge" style={{ background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' }}>
                    <CheckCircle2 size={13} /> موفق
                  </span>
                ) : isCanceled ? (
                  <span className="badge" style={{ background: 'rgba(248, 113, 113, 0.15)', color: '#f87171' }}>
                    <XCircle size={13} /> لغو / ناموفق
                  </span>
                ) : (
                  <span className="badge" style={{ background: 'rgba(250, 204, 21, 0.15)', color: '#facc15' }}>
                    <Clock size={13} /> در انتظار
                  </span>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
