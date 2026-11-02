import { useEffect, useState, type FormEvent } from 'react';
import { Save, Wallet } from 'lucide-react';
import { CollapsiblePanel } from '../../components/CollapsiblePanel';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';

/** Turns the Persian and Arabic digits into Latin ones and drops everything else. */
function toEnglishDigits(value: string): string {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return value
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[^\d]/g, '');
}

interface AdminPlan {
  id: string;
  title: string;
  tagline: string;
  priceTomans: number;
  features: string[];
  updatedAt: string | null;
}

/**
 * The prices of the plans.
 *
 * The admin sets the price of every paid plan from here, so the club can change the
 * price without a deployment and without touching the environment. The entitlements of
 * the plans are fixed on the server; only the price is free.
 */
export function AdminPlans() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const result = await api<{ plans: AdminPlan[] }>('GET', '/admin/plans');
      // A half answer must not break the panel, so the list is checked first.
      const list = Array.isArray(result?.plans) ? result.plans : [];
      setPlans(list);
      setPrices(Object.fromEntries(list.map((plan) => [plan.id, String(plan.priceTomans)])));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'قیمت پلن‌ها بارگذاری نشد.');
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
      const payload: Record<string, number> = {};
      for (const plan of plans) {
        const value = Number(toEnglishDigits(prices[plan.id] ?? ''));
        if (!Number.isFinite(value)) throw new ApiError(400, `قیمت «${plan.title}» را درست بنویسید.`);
        payload[plan.id] = value;
      }
      const result = await api<{ plans: AdminPlan[] }>('PUT', '/admin/plans', payload);
      const list = Array.isArray(result?.plans) ? result.plans : [];
      setPlans(list);
      setPrices(Object.fromEntries(list.map((plan) => [plan.id, String(plan.priceTomans)])));
      setNotice('قیمت پلن‌ها ذخیره شد و از همین حالا برای شاگردها اعمال می‌شود.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ذخیرهٔ قیمت‌ها ممکن نشد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <CollapsiblePanel
      title="قیمت پلن‌ها"
      subtitle="قیمت هر پلن، از همین‌جا عوض می‌شود"
      icon={<Wallet size={18} />}
      headingId="admin-plans-heading"
    >
      <p className="account-muted">
        قیمت هر پلن را اینجا بنویس و ذخیره کن؛ بی‌درنگی روی صفحهٔ خرید شاگردها اعمال می‌شود.
        دسترسی‌های هر پلن ثابت است و از اینجا تغییر نمی‌کند.
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <form className="admin-plans__form" onSubmit={(event) => void save(event)}>
        {plans.map((plan) => (
          <div key={plan.id} className="admin-plans__row">
            <div className="admin-plans__info">
              <strong>{plan.title}</strong>
              <small>{plan.tagline}</small>
              <ul>
                {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </div>
            <label className="field-control admin-plans__price">
              <span>قیمت ماهانه (تومان)</span>
              <input
                dir="ltr"
                inputMode="numeric"
                value={prices[plan.id] ?? ''}
                onChange={(event) => setPrices((current) => ({ ...current, [plan.id]: event.target.value }))}
                pattern="[0-9۰-۹٠-٩]*"
                required
              />
              <small>الان: {faNumber(plan.priceTomans)} تومان</small>
            </label>
          </div>
        ))}
        <button type="submit" className="button" disabled={busy || plans.length === 0}>
          <Save size={15} /> {busy ? 'در حال ذخیره…' : 'ذخیرهٔ قیمت‌ها'}
        </button>
      </form>
    </CollapsiblePanel>
  );
}
