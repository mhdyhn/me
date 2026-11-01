import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, CreditCard, Save, XCircle } from 'lucide-react';
import { ApiError, api, type PaymentTransaction, type TransactionsResponse } from '../../lib/api';
import { useSession } from '../../context/SessionContext';
import { PaymentPractice } from '../../components/PaymentPractice';
import { faNumber } from '../../lib/format';
import { PanelPage, RequireRole } from './AccountShell';


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
  const { user } = useSession();
  const [iban, setIban] = useState('');
  const [savingIban, setSavingIban] = useState(false);
  const savingIbanRef = useRef(false);
  const ibanRequest = useRef(0);
  const [ibanLoading, setIbanLoading] = useState(true);
  const [ibanLoaded, setIbanLoaded] = useState(false);
  const [ibanMessage, setIbanMessage] = useState<string | null>(null);
  const [ibanError, setIbanError] = useState<string | null>(null);

  const loadIban = useCallback(async () => {
    if (!user) return;
    const request = ++ibanRequest.current;
    setIbanLoading(true); setIbanLoaded(false); setIbanError(null);
    try {
      const res = await api<{ iban: string | null }>('GET', `/coach/iban?accountId=${user.id}`);
      if (!res || !('iban' in res) || (res.iban !== null && typeof res.iban !== 'string')) throw new Error('Invalid response');
      if (request === ibanRequest.current) { setIban(res.iban ?? ''); setIbanLoaded(true); }
    } catch (caught) {
      if (request === ibanRequest.current) setIbanError(caught instanceof ApiError ? caught.message : 'شمارهٔ شبا بارگذاری نشد؛ ابتدا دوباره بررسی کن.');
    } finally { if (request === ibanRequest.current) setIbanLoading(false); }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadIban(); return () => { ibanRequest.current += 1; }; }, [loadIban]);

  async function onSaveIban(e: FormEvent) {
    e.preventDefault();
    if (!user || !ibanLoaded || savingIbanRef.current) return;
    savingIbanRef.current = true; setSavingIban(true); setIbanMessage(null); setIbanError(null);
    try {
      const res = await api<{ ok: boolean; iban: string }>('PUT', '/coach/iban', { accountId: user.id, iban });
      if (!res || res.ok !== true || typeof res.iban !== 'string' || !/^IR\d{24}$/.test(res.iban) || res.iban !== iban.replace(/\s+/g, '').toUpperCase()) throw new Error('Unconfirmed');
      setIban(res.iban); setIbanMessage('شماره شبا با موفقیت ذخیره شد.');
    } catch (err) {
      const uncertain = !(err instanceof ApiError) || err.status === 0 || err.status === 408 || err.status === 409 || err.status >= 500 || (err.status >= 200 && err.status < 300);
      if (uncertain) setIbanLoaded(false);
      setIbanError(uncertain ? 'نتیجهٔ ذخیره تأیید نشد؛ شمارهٔ ذخیره‌شده را دوباره بررسی کن.' : err.message);
    } finally { savingIbanRef.current = false; setSavingIban(false); }
  }

  return (
    <PanelPage title="تراکنش‌ها و درآمد مربی">
      <Link className="back-link" to="/coach"><ArrowRight size={16} /> شاگردها</Link>
      <button type="button" className="button button--secondary financial-refresh" disabled={loading} onClick={() => void refresh()}>{loading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی گزارش مالی'}</button>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!report && !loadError && <p className="account-muted">در حال بارگذاری تراکنش‌ها…</p>}
      {report && <>
        <FinancialReport transactions={report.transactions} isCoach />
        {report.subscriptionShares && report.subscriptionShares.length > 0 && (
          <section className="panel-card financial-report" aria-label="سهم اشتراک معرفی‌شده">
            <h2>سهم اشتراک معرفی‌شده</h2>
            <p className="account-muted">هر شاگردی که از لینک ثبت‌نام شما آمده و اشتراک هوشمند خریده، ۱۰٪ مبلغ اشتراک برای شماست.</p>
            <div className="financial-report__stats">
              <Metric label="سهم شما از اشتراک‌ها" value={`${faNumber(report.subscriptionShares.reduce((sum, share) => sum + share.coachShareTomans, 0))} تومان`} />
              <Metric label="اشتراک‌های معرفی‌شده" value={`${faNumber(report.subscriptionShares.length)} عدد`} />
            </div>
            <div className="transaction-list">
              {report.subscriptionShares.map((share) => (
                <article key={share.id} className="panel-card" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div className="transaction-card__identity">
                    <div className="transaction-card__names"><span style={{ fontWeight: 600 }}>شاگرد: {share.studentName}</span></div>
                    <div className="account-muted transaction-card__meta">
                      <span>{new Date(share.createdAt).toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                      <span>مبلغ اشتراک: {faNumber(share.amountTomans)} تومان</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'end', display: 'grid', gap: 4 }}>
                    <strong style={{ fontSize: 16, color: '#4ade80' }}>{faNumber(share.coachShareTomans)} تومان</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>سهم ثبت‌شده شما</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </>}

      <section className="panel-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CreditCard size={18} /> شماره شبای تسویه حساب
        </h3>
        <p className="account-muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          ثبت شبا به‌تنهایی به معنی واریز وجه نیست. تسهیم و تسویهٔ بانکی باید پس از بررسی واریز توسط مدیر انجام شود؛ سهم پیش‌فرض مربی ۹۰٪ است و می‌تواند در تنظیمات سرور تغییر کند.
        </p>
        <form className="iban-form" onSubmit={(e) => void onSaveIban(e)}>
          <label className="iban-form__field"><span>شماره شبای بانکی</span>
          <input aria-label="شماره شبای بانکی" value={iban} onChange={(e) => { setIban(e.target.value.replace(/[۰-۹٠-٩]/g, (digit) => { const code = digit.charCodeAt(0); return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660); }).toUpperCase()); setIbanMessage(null); }}
            placeholder="IR..." dir="ltr" maxLength={34} autoCapitalize="characters" spellCheck={false} disabled={!ibanLoaded || savingIban} required /></label>
          <button type="submit" className="button button--primary" disabled={!ibanLoaded || savingIban}>
            <Save size={16} /> {savingIban ? 'در حال ثبت…' : 'ذخیره شبا'}
          </button>
        </form>
        <p className="field-hint">با IR و ۲۴ رقم؛ صحت شماره و مالکیت حساب توسط بانک تأیید نشده است.</p>
        {ibanLoading && <p className="field-hint" role="status">در حال دریافت شمارهٔ شبا…</p>}
        {!ibanLoaded && !ibanLoading && <button type="button" className="button button--secondary button--small" onClick={() => void loadIban()}>بررسی شمارهٔ ذخیره‌شده</button>}
        {ibanMessage && <p role="status" style={{ color: '#4ade80', fontSize: 13, margin: '8px 0 0' }}>{ibanMessage}</p>}
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
      <button type="button" className="button button--secondary financial-refresh" disabled={loading} onClick={() => void refresh()}>{loading ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی گزارش مالی'}</button>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!report && !loadError && <p className="account-muted">در حال بارگذاری تراکنش‌ها…</p>}
      {report && <>
        <FinancialReport transactions={report.transactions} isCoach={false} />
      </>}
      <SampleCalculation />
    </PanelPage>
  );
}

function FinancialReport({ transactions, isCoach }: { transactions: PaymentTransaction[]; isCoach: boolean }) {
  const paid = transactions.filter((t) => t.status === 'paid');
  const volume = paid.reduce((sum, t) => sum + t.amountTomans, 0);
  const coachShare = paid.reduce((sum, t) => sum + t.coachShareTomans, 0);
  const adminShare = paid.reduce((sum, t) => sum + t.adminShareTomans, 0);
  return (
    <section className="financial-report" aria-label="گزارش مالی">
      <h2>گزارش مالی</h2>
      <p className="account-muted">این اعداد بر اساس تراکنش‌های ثبت‌شدهٔ موفق‌اند و به‌تنهایی تأیید واریز یا تسویهٔ بانکی نیستند.</p>
      <div className="financial-report__stats">
        {!isCoach && <Metric label="کل مبلغ" value={`${faNumber(volume)} تومان`} />}
        {!isCoach && <Metric label="سهم باشگاه" value={`${faNumber(adminShare)} تومان`} />}
        <Metric label={isCoach ? 'سهم شما' : 'سهم مربیان'} value={`${faNumber(coachShare)} تومان`} />
        <Metric label="تراکنش‌های موفق" value={`${faNumber(paid.length)} عدد`} />
      </div>
      <h3>تراکنش‌ها</h3>
      {transactions.length === 0 ? <p className="account-muted">هنوز تراکنشی ثبت نشده است.</p> :
        <TransactionList transactions={transactions} isCoach={isCoach} />}
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

function TransactionList({ transactions, isCoach }: { transactions: PaymentTransaction[]; isCoach: boolean }) {
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
              </div>
              <div className="account-muted transaction-card__meta">
                <span>{dateStr}</span>
                {t.refId && <span>کد پیگیری: <code dir="ltr">{t.refId}</code></span>}
              </div>
            </div>
            <div style={{ textAlign: 'end', display: 'grid', gap: 4 }}>
              <div>
                <strong style={{ fontSize: 16 }}>{faNumber(t.amountTomans)} تومان</strong>
                {isCoach && <span style={{ display: 'block', fontSize: 12, color: '#4ade80' }}>
                  {shareLabel} شما: {faNumber(t.coachShareTomans)} تومان
                </span>}
                {!isCoach && <span style={{ display: 'block', fontSize: 12 }}>
                  {shareLabel} مربی: {faNumber(t.coachShareTomans)} تومان
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
