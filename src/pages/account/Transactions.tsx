import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, CreditCard, Save, XCircle } from 'lucide-react';
import { ApiError, api, type PaymentTransaction, type TransactionsResponse } from '../../lib/api';
import { confirmModal } from '../../components/ConfirmModal';
import { PaymentPractice } from '../../components/PaymentPractice';
import { faNumber } from '../../lib/format';
import { PanelPage, RequireRole } from './AccountShell';

type TestMode = { available: boolean; enabled: boolean; expiresAt: string | null };

function useFinancialReport(path: string) {
  const [report, setReport] = useState<TransactionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    try {
      const result = await api<TransactionsResponse>('GET', path);
      if (current === requestId.current) { setReport(result); setError(null); }
    } catch (caught) {
      if (current === requestId.current) setError(caught instanceof ApiError ? caught.message : 'تراکنش‌ها بارگذاری نشدند.');
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { requestId.current += 1; window.removeEventListener('focus', onFocus); };
  }, [refresh]);
  return { report, error, loading, refresh };
}

export function CoachTransactions() {
  return <RequireRole roles={['coach']}><CoachTransactionsView /></RequireRole>;
}

function CoachTransactionsView() {
  const { report, error: loadError, loading, refresh } = useFinancialReport('/coach/transactions');
  const [iban, setIban] = useState('');
  const [savingIban, setSavingIban] = useState(false);
  const [ibanMessage, setIbanMessage] = useState<string | null>(null);
  const [ibanError, setIbanError] = useState<string | null>(null);

  useEffect(() => {
    api<{ iban: string | null }>('GET', '/coach/iban')
      .then((res) => setIban(res.iban ?? ''))
      .catch((caught) => setIbanError(caught instanceof ApiError ? caught.message : 'شمارهٔ شبا بارگذاری نشد.'));
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

  return (
    <PanelPage title="تراکنش‌ها و درآمد مربی">
      <Link className="back-link" to="/coach"><ArrowRight size={16} /> شاگردها</Link>
      <button type="button" className="button button--secondary financial-refresh" disabled={loading} onClick={() => void refresh()}>{loading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی گزارش مالی'}</button>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!report && !loadError && <p className="account-muted">در حال بارگذاری تراکنش‌ها…</p>}
      {report && <>
        <FinancialReport transactions={report.testTransactions ?? []} isCoach simulation />
        <FinancialReport transactions={report.transactions} isCoach />
      </>}

      <section className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} /> شماره شبای تسویه حساب
        </h3>
        <p className="account-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          ثبت شبا به‌تنهایی به معنی واریز وجه نیست. تسهیم و تسویهٔ بانکی باید پس از اتصال درگاه و بررسی قرارداد آن تأیید شوند؛ سهم پیش‌فرض مربی ۹۰٪ است و می‌تواند در تنظیمات سرور تغییر کند.
        </p>
        <form onSubmit={(e) => void onSaveIban(e)} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input aria-label="شماره شبای بانکی" value={iban} onChange={(e) => setIban(e.target.value)}
            placeholder="IR..." dir="ltr" maxLength={34} required
            style={{ width: 'min(100%, 260px)', minWidth: 0, fontFamily: 'monospace' }} />
          <button type="submit" className="button button--primary" disabled={savingIban}>
            <Save size={16} /> {savingIban ? 'در حال ثبت…' : 'ذخیره شبا'}
          </button>
        </form>
        {ibanMessage && <p style={{ color: '#4ade80', fontSize: 13, margin: '8px 0 0' }}>{ibanMessage}</p>}
        {ibanError && <p className="form-error" style={{ margin: '8px 0 0' }}>{ibanError}</p>}
      </section>
      <SampleCalculation isCoach />
    </PanelPage>
  );
}

export function AdminTransactions() {
  return <RequireRole roles={['admin']}><AdminTransactionsView /></RequireRole>;
}

function AdminTransactionsView() {
  const { report, error: loadError, loading, refresh } = useFinancialReport('/admin/transactions');

  return (
    <PanelPage title="تراکنش‌های کل باشگاه">
      <Link className="back-link" to="/coach"><ArrowRight size={16} /> مربی‌ها</Link>
      <TestModeControl onChanged={refresh} />
      <button type="button" className="button button--secondary financial-refresh" disabled={loading} onClick={() => void refresh()}>{loading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی گزارش مالی'}</button>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!report && !loadError && <p className="account-muted">در حال بارگذاری تراکنش‌ها…</p>}
      {report && <>
        <FinancialReport transactions={report.testTransactions ?? []} isCoach={false} simulation />
        <FinancialReport transactions={report.transactions} isCoach={false} />
      </>}
      <SampleCalculation />
    </PanelPage>
  );
}

function TestModeControl({ onChanged }: { onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<TestMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  async function load() {
    const current = ++requestId.current;
    try {
      const result = await api<TestMode>('GET', '/admin/payment-test-mode');
      if (current === requestId.current) { setMode(result); setError(null); }
    } catch (caught) {
      if (current === requestId.current) setError(caught instanceof ApiError ? caught.message : 'وضعیت آزمایش بارگذاری نشد.');
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('focus', refresh);
    return () => { requestId.current += 1; window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    if (!mode?.enabled || !mode.expiresAt) return;
    const delay = Date.parse(mode.expiresAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => void load(), delay + 250);
    return () => window.clearTimeout(timer);
  }, [mode?.enabled, mode?.expiresAt]);

  async function change(enabled: boolean) {
    const accepted = await confirmModal(enabled ? {
      title: 'فعال‌کردن آزمایش سراسری',
      message: 'تا ۲۴ ساعت همهٔ شاگردان می‌توانند برنامهٔ پولی خود را بدون پرداخت بانکی آزمایشی باز کنند. از حساب‌های آزمایشی استفاده کنید؛ تمرین‌های ثبت‌شده دادهٔ واقعی حساب هستند. گزارش مالی آزمایشی جدا از واقعی است. ادامه می‌دهید؟',
      confirmText: 'فعال‌کردن آزمایش سراسری', cancelText: 'انصراف', variant: 'warning',
    } : {
      title: 'پایان آزمایش سراسری',
      message: 'دسترسی‌هایی که از حالت سراسری گرفته شده‌اند قطع می‌شوند؛ گزارش آزمایشی باقی می‌ماند. مجوزهای فردی مربیان جداگانه معتبر می‌مانند. ادامه می‌دهید؟',
      confirmText: 'پایان آزمایش سراسری', cancelText: 'انصراف', variant: 'warning',
    });
    if (!accepted) return;
    setBusy(true);
    setError(null);
    requestId.current += 1;
    try {
      const result = await api<TestMode>('PUT', '/admin/payment-test-mode', { enabled });
      requestId.current += 1;
      setMode(result);
      void onChanged();
    } catch (caught) {
      setMode(null);
      setError(caught instanceof ApiError && caught.status !== 0 ? caught.message : 'نتیجهٔ درخواست مشخص نیست؛ وضعیت را دوباره بررسی کنید.');
      void load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-card test-mode-card" aria-label="مدیریت آزمایش سراسری خرید">
      <h2>حالت آزمایشی خرید</h2>
      <p>برای تست مانند خرید معمول، بدون درگاه بانکی؛ نتیجه در گزارش مالی آزمایشی مربی و مدیر ثبت می‌شود.</p>
      <p><strong>هشدار:</strong> در حالت سراسری همهٔ شاگردان می‌توانند برنامهٔ پولی خود را بدون پول باز کنند. فقط هنگام آزمایش و ترجیحاً با حساب‌های آزمایشی روشن کنید.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!mode && !error && <p>در حال بررسی وضعیت…</p>}
      {!mode && error && <button type="button" className="button button--secondary" onClick={() => void load()}>بررسی دوباره</button>}
      {mode && !mode.available && <p role="status">آزمایش با تنظیم شناسهٔ درگاه واقعی یا غیرفعال‌شدن آن در سرور در دسترس نیست.</p>}
      {mode?.available && (mode.enabled ? <>
        <p role="status">آزمایش سراسری روشن است{mode.expiresAt ? ` تا ${new Date(mode.expiresAt).toLocaleString('fa-IR')}` : ''}؛ سپس خودکار پایان می‌یابد.</p>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void change(false)}>{busy ? 'در حال ثبت…' : 'پایان آزمایش سراسری'}</button>
      </> : <>
        <p role="status">آزمایش سراسری خاموش است. مجوز فردی مربی همچنان جداگانه قابل استفاده است.</p>
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => void change(true)}>{busy ? 'در حال ثبت…' : 'فعال‌کردن آزمایش سراسری'}</button>
      </>)}
    </section>
  );
}

function FinancialReport({ transactions, isCoach, simulation = false }: { transactions: PaymentTransaction[]; isCoach: boolean; simulation?: boolean }) {
  const paid = transactions.filter((t) => t.status === 'paid');
  const volume = paid.reduce((sum, t) => sum + t.amountTomans, 0);
  const coachShare = paid.reduce((sum, t) => sum + t.coachShareTomans, 0);
  const adminShare = paid.reduce((sum, t) => sum + t.adminShareTomans, 0);
  const prefix = simulation ? 'آزمایشی' : 'واقعی';
  return (
    <section className={simulation ? 'financial-report financial-report--test' : 'financial-report'} aria-label={`گزارش مالی ${prefix}`}>
      <h2>گزارش مالی {prefix}</h2>
      <p className="account-muted">{simulation
        ? 'خریدهای آزمایشی با همان مبلغ و درصد سهم محاسبه می‌شوند؛ هیچ پولی جابه‌جا نشده و این اعداد در جمع واقعی نیستند.'
        : 'این اعداد بر اساس تراکنش‌های ثبت‌شدهٔ موفق‌اند و به‌تنهایی تأیید واریز یا تسویهٔ بانکی نیستند.'}</p>
      {simulation && <p className="account-muted">خریدهای آزمایشی قدیمی که پیش از ایجاد این گزارش انجام شده‌اند، اطلاعات مالی قابل بازیابی ندارند.</p>}
      <div className="financial-report__stats">
        {!isCoach && <Metric label={`کل مبلغ ${prefix}`} value={`${faNumber(volume)} تومان`} />}
        {isCoach && simulation && <Metric label="کل خرید آزمایشی موفق شاگردان" value={`${faNumber(volume)} تومان`} />}
        {!isCoach && <Metric label={`سهم ${prefix} باشگاه`} value={`${faNumber(adminShare)} تومان`} />}
        <Metric label={isCoach ? `سهم ${prefix} شما` : `سهم ${prefix} مربیان`} value={`${faNumber(coachShare)} تومان`} />
        <Metric label={`تراکنش‌های موفق ${prefix}`} value={`${faNumber(paid.length)} عدد`} />
      </div>
      <h3>تراکنش‌های {prefix}</h3>
      {transactions.length === 0 ? <p className="account-muted">هنوز تراکنش {prefix} ثبت نشده است.</p> :
        <TransactionList transactions={transactions} isCoach={isCoach} simulation={simulation} />}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="panel-card financial-report__metric"><span className="account-muted">{label}</span><strong>{value}</strong></div>;
}

function SampleCalculation({ isCoach = false }: { isCoach?: boolean }) {
  return (
    <section className="panel-card" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>محاسبهٔ نمونه، بدون خرید</h3>
      <p className="account-muted">این ابزار فقط درصدها را با مبلغ دلخواه نشان می‌دهد و خرید یا تراکنش ثبت نمی‌کند.</p>
      {isCoach && <Link to="/coach" className="button button--secondary">انتخاب شاگرد</Link>}
      <PaymentPractice program={null} sample />
    </section>
  );
}

function TransactionList({ transactions, isCoach, simulation }: { transactions: PaymentTransaction[]; isCoach: boolean; simulation: boolean }) {
  return (
    <div className="transaction-list">
      {transactions.map((t) => {
        const isPaid = t.status === 'paid';
        const isCanceled = t.status === 'canceled' || t.status === 'failed';
        const dateStr = new Date(t.createdAt).toLocaleDateString('fa-IR', {
          year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
        const shareLabel = isPaid ? 'سهم ثبت‌شده' : 'سهم در صورت موفقیت';
        return (
          <article key={t.id} className="panel-card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div className="transaction-card__identity">
              <div className="transaction-card__names">
                <span style={{ fontWeight: 600 }}>شاگرد: {t.studentName ?? 'شاگرد'}</span>
                {!isCoach && t.coachName && <span className="badge">مربی: {t.coachName}</span>}
                {simulation && <span className="badge test-transaction-badge">آزمایشی؛ بدون پول</span>}
              </div>
              <div className="account-muted transaction-card__meta">
                <span>{dateStr}</span>
                {simulation && <span>شمارهٔ آزمایش: {faNumber(t.id)}</span>}
                {t.refId && <span>کد پیگیری: <code dir="ltr">{t.refId}</code></span>}
              </div>
            </div>
            <div style={{ textAlign: 'end', display: 'grid', gap: 4 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{faNumber(t.amountTomans)} تومان</strong>
                {(isCoach || simulation) && <span style={{ display: 'block', fontSize: 12, color: '#4ade80' }}>
                  {shareLabel} {isCoach ? 'شما' : 'مربی'}: {faNumber(t.coachShareTomans)} تومان
                </span>}
                {simulation && !isCoach && <span style={{ display: 'block', fontSize: 12 }}>
                  {shareLabel} باشگاه: {faNumber(t.adminShareTomans)} تومان
                </span>}
              </div>
              <div>
                {isPaid ? <span className="badge" style={{ background: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' }}><CheckCircle2 size={13} /> موفق</span>
                  : isCanceled ? <span className="badge" style={{ background: 'rgba(248, 113, 113, 0.15)', color: '#f87171' }}><XCircle size={13} /> لغو / ناموفق</span>
                    : <span className="badge" style={{ background: 'rgba(250, 204, 21, 0.15)', color: '#facc15' }}><Clock size={13} /> {t.status === 'expired' ? 'منقضی / پایان‌یافته' : 'در انتظار'}</span>}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
