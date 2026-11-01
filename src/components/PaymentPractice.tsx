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

/** A read-only preview of the split; it never moves money and never writes a transaction. */
export function PaymentPractice({ program, studentId, sample = false }: { program: PracticeProgram | null; studentId?: number; sample?: boolean }) {
  const [quote, setQuote] = useState<PracticeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [samplePrice, setSamplePrice] = useState('250000');
  const requestVersion = useRef(0);
  const sampleAmount = Number(samplePrice);
  const validSample = Number.isSafeInteger(sampleAmount) && sampleAmount >= 1 && sampleAmount <= 2147483647;
  const canPreview = sample ? validSample : !!program?.id && Number.isSafeInteger(program.version) && (program.priceTomans ?? 0) > 0;

  useEffect(() => {
    requestVersion.current += 1;
    setQuote(null);
    setError(null);
    setLoading(false);
    return () => { requestVersion.current += 1; };
  }, [program?.id, program?.version, studentId, sample]);

  async function start() {
    if (!canPreview || (!sample && !program)) return;
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
        throw new Error('Invalid preview response');
      }
      if (requestVersion.current === current) setQuote(result);
    } catch (caught) {
      if (requestVersion.current === current) {
        setError(caught instanceof ApiError ? caught.message : 'پیش‌نمایش بارگذاری نشد. دوباره تلاش کنید.');
      }
    } finally {
      if (requestVersion.current === current) setLoading(false);
    }
  }

  return (
    <details className="payment-practice">
      <summary><span>پیش‌نمایش سهم مربی</span><small>صرفاً نمایشی</small></summary>
      <div className="payment-practice__content">
        <p>این بخش فقط مبلغ برنامه و سهم مربی و مدیر را نشان می‌دهد؛ پولی جابه‌جا نمی‌کند، تراکنشی ثبت نمی‌کند و برنامه‌ای را باز نمی‌کند.</p>
        {sample && <p>این نمونه مستقل از حساب شاگرد و برنامه‌های واقعی است و مبلغ واردشده ذخیره نمی‌شود.</p>}
        {!sample && studentId !== undefined && <p>مبلغ از برنامهٔ ذخیره‌شده خوانده می‌شود؛ تغییرات ذخیره‌نشده در پیش‌نمایش لحاظ نمی‌شوند.</p>}
        {sample && !quote && (
          <label className="field payment-practice__amount">
            <span>مبلغ نمونه (تومان)</span>
            <input type="number" inputMode="numeric" min={1} max={2147483647} step={1} value={samplePrice} onChange={(event) => setSamplePrice(event.target.value)} disabled={loading} />
            {!validSample && <small>مبلغ باید بین ۱ تا ۲٬۱۴۷٬۴۸۳٬۶۴۷ تومان باشد.</small>}
          </label>
        )}
        {!sample && !canPreview && <p>ابتدا یک برنامهٔ پولی برای شاگرد ذخیره کنید.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {(sample || canPreview) && !quote && (
          <button type="button" className="button button--secondary" onClick={() => void start()} disabled={loading || !canPreview}>
            {loading ? 'در حال آماده‌سازی…' : 'نمایش سهم'}
          </button>
        )}
        {quote && (
          <div className="payment-practice__result">
            <strong>{quote.programmeTitle}</strong>
            <p>مبلغ برنامه: <strong>{faNumber(quote.amountTomans)} تومان</strong></p>
            {(sample || studentId !== undefined) && quote.coachShareTomans !== undefined && quote.adminShareTomans !== undefined && (
              <p>سهم محاسبه‌شدهٔ مربی: {faNumber(quote.coachShareTomans)} تومان · سهم مدیر: {faNumber(quote.adminShareTomans)} تومان</p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
