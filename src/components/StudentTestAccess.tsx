import { useEffect, useState } from 'react';
import { ApiError, api, type Programme } from '../lib/api';
import { confirmModal } from './ConfirmModal';

type TestAccess = { available: boolean; enabled: boolean; purchased: boolean; expiresAt: string | null; globalModeEnabled?: boolean };

/** The coach explicitly grants temporary test access to just one student. */
export function StudentTestAccess({ studentId, program }: { studentId: number; program: Programme | null }) {
  const [access, setAccess] = useState<TestAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const canEnable = !!program?.id && Number.isSafeInteger(program.version) && (program.priceTomans ?? 0) > 0;

  useEffect(() => {
    let canceled = false;
    setAccess(null);
    setError(null);
    if (!canEnable) return () => { canceled = true; };
    api<TestAccess>('GET', `/students/${studentId}/test-purchase`)
      .then((result) => { if (!canceled) setAccess(result); })
      .catch((caught) => { if (!canceled) setError(caught instanceof ApiError ? caught.message : 'وضعیت خرید آزمایشی بارگذاری نشد.'); });
    return () => { canceled = true; };
  }, [studentId, program?.id, program?.version, canEnable, attempt]);

  async function change(enabled: boolean) {
    if (!program || !canEnable) return;
    if (enabled) {
      const confirmed = await confirmModal({
        title: 'فعال‌کردن خرید آزمایشی',
        message: 'این شاگرد پس از تأیید آزمایشی، بدون پرداخت واقعی تا ۲۴ ساعت محتوای برنامه را می‌بیند. تمرین‌های ثبت‌شده در حساب او ذخیره می‌شوند؛ ترجیحاً از حساب آزمایشی استفاده کنید. ادامه می‌دهید؟',
        confirmText: 'فعال‌کردن آزمایش', cancelText: 'انصراف', variant: 'warning',
      });
      if (!confirmed) return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ enabled: boolean; expiresAt?: string }>('PUT', `/students/${studentId}/test-purchase`, {
        enabled, expectedId: program.id, expectedVersion: program.version,
      });
      setAccess({ available: access?.available ?? true, enabled: result.enabled, purchased: false, expiresAt: result.expiresAt ?? null, globalModeEnabled: access?.globalModeEnabled });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'وضعیت خرید آزمایشی تغییر نکرد.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <details className="payment-practice student-test-access">
      <summary><span>خرید آزمایشی برای این شاگرد</span><small>فقط با اجازهٔ مربی</small></summary>
      <div className="payment-practice__content">
        <p>با اجازهٔ شما، شاگرد می‌تواند خرید را بدون پول واقعی انجام دهد و برنامه را حداکثر ۲۴ ساعت آزمایشی باز کند. این خرید درآمد یا پرداخت واقعی نیست.</p>
        <p>فقط برای حساب آزمایشی فعال کنید؛ تمرین‌هایی که در حساب شاگرد ثبت شوند، دادهٔ معمولی همان حساب هستند.</p>
        {access?.globalModeEnabled && <p role="status">حالت آزمایش سراسری مدیر روشن است؛ تا پایان آن، این شاگرد حتی پس از لغو مجوز فردی می‌تواند دوباره آزمایش کند.</p>}
        {!canEnable ? <p>ابتدا برنامهٔ پولی این شاگرد را ذخیره کنید.</p> : error ? (
          <><p className="form-error" role="alert">{error}</p><button type="button" className="button button--secondary" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button></>
        ) : !access ? <p>در حال بررسی وضعیت آزمایش…</p> : !access.available ? (
          <p>خرید آزمایشی با تنظیم شناسهٔ درگاه واقعی یا غیرفعال‌شدن آزمون در سرور در دسترس نیست.</p>
        ) : access.enabled ? (
          <>
            <p role="status">خرید آزمایشی برای این شاگرد فعال است{access.purchased ? ' و انجام شده است' : ''}. پایان مهلت: {access.expiresAt ? new Date(access.expiresAt).toLocaleString('fa-IR') : 'نامشخص'}.</p>
            <div className="payment-practice__actions">
              <button type="button" className="button button--secondary" disabled={loading} onClick={() => void change(false)}>{loading ? 'در حال ثبت…' : 'پایان دسترسی آزمایشی'}</button>
              <button type="button" className="button button--ghost" disabled={loading} onClick={() => setAttempt((value) => value + 1)}>بررسی دوبارهٔ آزمایش</button>
            </div>
          </>
        ) : (
          <button type="button" className="button button--secondary" disabled={loading} onClick={() => void change(true)}>{loading ? 'در حال ثبت…' : 'اجازهٔ خرید آزمایشی برای این شاگرد'}</button>
        )}
      </div>
    </details>
  );
}
