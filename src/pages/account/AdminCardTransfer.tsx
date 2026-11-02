import { useEffect, useState, type FormEvent } from 'react';
import { CreditCard, Landmark, Save, ShieldCheck } from 'lucide-react';
import { CollapsiblePanel } from '../../components/CollapsiblePanel';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';

interface Settings {
  cardNumber: string;
  cardHolder: string;
  bankName: string;
  expiryHours: number;
  maxPerDay: number;
  uniqueAmount: boolean;
  updatedAt: string | null;
}

interface CardTransferState {
  enabled: boolean;
  source: 'panel' | 'environment' | 'off';
  settings: Settings;
}

/**
 * The card-to-card settings of the club.
 *
 * The admin turns the payment on from here, so no deployment and no environment change
 * is needed: the card the students pay to is stored with the club, and the change is
 * effective immediately.
 */
export function AdminCardTransfer() {
  const [state, setState] = useState<CardTransferState | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [expiryHours, setExpiryHours] = useState('72');
  const [maxPerDay, setMaxPerDay] = useState('3');
  const [uniqueAmount, setUniqueAmount] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await api<CardTransferState>('GET', '/admin/card-transfer');
      setState(result);
      setCardNumber(result.settings.cardNumber);
      setCardHolder(result.settings.cardHolder);
      setBankName(result.settings.bankName);
      setExpiryHours(String(result.settings.expiryHours));
      setMaxPerDay(String(result.settings.maxPerDay));
      setUniqueAmount(result.settings.uniqueAmount);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تنظیمات کارت‌به‌کارت بارگذاری نشد.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api<{ enabled: boolean }>('PUT', '/admin/card-transfer', {
        cardNumber: cardNumber.trim(),
        cardHolder: cardHolder.trim(),
        bankName: bankName.trim(),
        expiryHours: Number(expiryHours),
        maxPerDay: Number(maxPerDay),
        uniqueAmount,
      });
      setState((current) => (current ? { ...current, enabled: result.enabled, source: 'panel' } : current));
      setNotice(result.enabled
        ? 'پرداخت کارت‌به‌کارت فعال شد و از همین حالا برای شاگردها کار می‌کند.'
        : 'پرداخت کارت‌به‌کارت غیرفعال شد.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ذخیرهٔ تنظیمات ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  const enabled = state?.enabled ?? false;
  const shownCard = (state?.settings?.cardNumber ?? '').replace(/(.{4})/g, '$1 ').trim();

  return (
    <CollapsiblePanel
      title="پرداخت کارت‌به‌کارت"
      subtitle="تنها روش پرداخت میتی"
      icon={<Landmark size={18} />}
      headingId="admin-card-transfer-heading"
      badge={
        <span className={`admin-card-transfer__status ${enabled ? 'is-on' : 'is-off'}`}>
          {enabled ? <><ShieldCheck size={14} /> فعال</> : 'غیرفعال'}
        </span>
      }
    >
      <p className="account-muted">
        کارتی را که شاگردها به آن واریز می‌کنند اینجا ثبت کنید؛
        تغییرها بدون استقرار تازه و بلافاصله اعمال می‌شود.
      </p>

      {state?.source === 'environment' && (
        <p className="account-muted">این تنظیم هنوز از متغیرهای محیطی خوانده می‌شود؛ با ذخیرهٔ این فرم، تنظیم پنل جایگزین آن می‌شود.</p>
      )}

      <form className="admin-card-transfer__form" onSubmit={(event) => void save(event)}>
        <div className="field">
          <label htmlFor="card-transfer-card-number">شمارهٔ کارت مقصد</label>
          <input
            id="card-transfer-card-number"
            dir="ltr"
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value.replace(/[^\d۰-۹٠-٩\s-]/g, ''))}
            inputMode="numeric"
            autoComplete="off"
            maxLength={25}
            placeholder="6037991234567890"
          />
          <small className="field-hint">۱۶ رقم. برای غیرفعال‌کردن پرداخت، این کادر را خالی بگذارید و ذخیره کنید.</small>
        </div>
        <div className="field">
          <label htmlFor="card-transfer-card-holder">نام صاحب کارت</label>
          <input
            id="card-transfer-card-holder"
            value={cardHolder}
            onChange={(event) => setCardHolder(event.target.value)}
            maxLength={60}
            placeholder="مثلاً میتی"
          />
        </div>
        <div className="field">
          <label htmlFor="card-transfer-bank-name">نام بانک (اختیاری)</label>
          <input
            id="card-transfer-bank-name"
            value={bankName}
            onChange={(event) => setBankName(event.target.value)}
            maxLength={60}
            placeholder="مثلاً ملت"
          />
        </div>
        <div className="field">
          <label htmlFor="card-transfer-expiry-hours">مهلت اعتبار درخواست (ساعت)</label>
          <input
            id="card-transfer-expiry-hours"
            value={expiryHours}
            onChange={(event) => setExpiryHours(event.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            maxLength={4}
          />
        </div>
        <div className="field">
          <label htmlFor="card-transfer-max-per-day">سقف رسید در هر روز برای هر شاگرد</label>
          <input
            id="card-transfer-max-per-day"
            value={maxPerDay}
            onChange={(event) => setMaxPerDay(event.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            maxLength={3}
          />
        </div>
        <label className="field admin-card-transfer__toggle">
          <input type="checkbox" checked={uniqueAmount} onChange={(event) => setUniqueAmount(event.target.checked)} />
          <span>مبلغ متمایز (برای پیدا شدن واریز در صورت‌حساب بانک)</span>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        <button type="submit" className="button button--primary" disabled={busy}>
          <Save size={15} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ تنظیمات'}
        </button>
      </form>

      {enabled && (
        <p className="account-muted">
          <CreditCard size={14} /> شاگردها اکنون مبلغ را به کارت
          {' '}<b dir="ltr">{shownCard}</b>
          {state?.settings.bankName ? ` (${state.settings.bankName})` : ''} واریز می‌کنند و با ثبت شمارهٔ پیگیری، برنامه بلافاصله باز می‌شود.
          {' '}سقف روزانه: {faNumber(state?.settings.maxPerDay ?? 0)} رسید.
        </p>
      )}
    </CollapsiblePanel>
  );
}
