import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { faNumber } from '../lib/format';

type PracticeProgram = { id: string; version: number; priceTomans?: number };
type PracticeQuote = {
  simulation: true;
  programmeTitle: string;
  amountTomans: number;
  coachShareTomans?: number;
  adminShareTomans?: number;
};

/** A labelled rehearsal only; the result stays in this component, never in the ledger. */
export function PaymentPractice({ program, studentId, sample = false }: { program: PracticeProgram | null; studentId?: number; sample?: boolean }) {
  const [quote, setQuote] = useState<PracticeQuote | null>(null);
  const [outcome, setOutcome] = useState<'success' | 'canceled' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samplePrice, setSamplePrice] = useState('250000');
  const requestVersion = useRef(0);
  const sampleAmount = Number(samplePrice);
  const validSample = Number.isSafeInteger(sampleAmount) && sampleAmount >= 1 && sampleAmount <= 2147483647;
  const canPractice = sample ? validSample : !!program?.id && Number.isSafeInteger(program.version) && (program.priceTomans ?? 0) > 0;

  useEffect(() => {
    requestVersion.current += 1;
    setQuote(null);
    setOutcome(null);
    setError(null);
    setLoading(false);
    return () => { requestVersion.current += 1; };
  }, [program?.id, program?.version, studentId, sample]);

  async function start() {
    if (!canPractice || (!sample && !program)) return;
    const current = ++requestVersion.current;
    setError(null);
    setLoading(true);
    try {
      const input = sample ? { sampleAmountTomans: sampleAmount } : {
        expectedId: program!.id,
        expectedVersion: program!.version,
        ...(studentId !== undefined ? { studentId } : {}),
      };
      const result = await api<PracticeQuote>('POST', '/pay/practice', input);
      if (result.simulation !== true || !Number.isSafeInteger(result.amountTomans) || result.amountTomans <= 0) {
        throw new Error('Invalid practice response');
      }
      if (requestVersion.current === current) setQuote(result);
    } catch (caught) {
      if (requestVersion.current === current) {
        setError(caught instanceof ApiError ? caught.message : 'آزمایش بارگذاری نشد. دوباره تلاش کنید.');
      }
    } finally {
      if (requestVersion.current === current) setLoading(false);
    }
  }

  return (
    <details className="payment-practice">
      <summary><span>آزمایش پرداخت بدون درگاه</span><small>صرفاً نمایشی</small></summary>
      <div className="payment-practice__content">
        <p>این آزمایش پولی جابه‌جا نمی‌کند، تراکنشی ثبت نمی‌کند و برنامه را باز نمی‌کند. اتصال واقعی درگاه و بازگشت بانکی در این بخش آزموده نمی‌شوند.</p>
        {sample && <p>این نمونه مستقل از حساب شاگرد و برنامه‌های واقعی است و مبلغ واردشده ذخیره نمی‌شود.</p>}
        {!sample && studentId !== undefined && <p>مبلغ از برنامهٔ ذخیره‌شده خوانده می‌شود؛ تغییرات ذخیره‌نشده در آزمایش لحاظ نمی‌شوند.</p>}
        {sample && !quote && (
          <label className="field payment-practice__amount">
            <span>مبلغ نمونه (تومان)</span>
            <input type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={samplePrice} onChange={(event) => setSamplePrice(event.target.value)} disabled={loading} />
            {!validSample && <small>مبلغ باید بین ۱ تا ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان باشد.</small>}
          </label>
        )}
        {!sample && !canPractice && <p>ابتدا یک برنامهٔ پولی برای شاگرد ذخیره کنید.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {(sample || canPractice) && !quote && (
          <button type="button" className="button button--secondary" onClick={() => void start()} disabled={loading || !canPractice}>
            {loading ? 'در حال آماده‌سازی…' : 'شروع آزمایش پرداخت'}
          </button>
        )}
        {quote && !outcome && (
          <div className="payment-practice__result">
            <strong>پیش‌نمایش آزمایشی: {quote.programmeTitle}</strong>
            <p>مبلغ برنامه: <strong>{faNumber(quote.amountTomans)} تومان</strong></p>
            {(sample || studentId !== undefined) && quote.coachShareTomans !== undefined && quote.adminShareTomans !== undefined && (
              <p>سهم محاسبه‌شدهٔ مربی: {faNumber(quote.coachShareTomans)} تومان · سهم مدیر: {faNumber(quote.adminShareTomans)} تومان</p>
            )}
            <div className="payment-practice__actions">
              <button type="button" className="button button--secondary" onClick={() => setOutcome('success')}>فرض پرداخت موفق</button>
              <button type="button" className="button button--ghost" onClick={() => setOutcome('canceled')}>فرض انصراف</button>
            </div>
          </div>
        )}
        {quote && outcome && (
          <div className="payment-practice__result" role="status">
            <strong>{outcome === 'success' ? 'نتیجهٔ آزمایشی: پرداخت موفق فرض شد.' : 'نتیجهٔ آزمایشی: انصراف فرض شد.'}</strong>
            <p>هیچ پول، تراکنش یا دسترسی واقعی ایجاد نشده است.</p>
            <button type="button" className="button button--secondary" onClick={() => { setQuote(null); setOutcome(null); }}>آزمایش دوباره</button>
          </div>
        )}
      </div>
    </details>
  );
}
