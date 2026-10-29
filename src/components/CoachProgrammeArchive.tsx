import { useState } from 'react';
import { ArchiveRestore, RefreshCw } from 'lucide-react';
import { ApiError, api, type Programme } from '../lib/api';
import { faNumber } from '../lib/format';
import { confirmModal } from './ConfirmModal';

/** Past offers belong to the current coach; a restored offer keeps its purchase identity. */
export function CoachProgrammeArchive({ studentId, currentProgram, onRestore }: { studentId: number; currentProgram: Programme | null; onRestore: (program: Programme) => void }) {
  const [programs, setPrograms] = useState<Programme[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load(next: string | null = null) {
    setBusy(true); setError('');
    try {
      const page = await api<{ programs: Programme[]; nextCursor: string | null }>('GET', `/students/${studentId}/programs/archive${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      if (!Array.isArray(page.programs)) throw new ApiError(0, 'پاسخ بایگانی معتبر نیست.');
      setPrograms((old) => next ? [...old, ...page.programs] : page.programs);
      setCursor(page.nextCursor ?? null); setLoaded(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'دریافت بایگانی ممکن نشد.');
    } finally { setBusy(false); }
  }

  async function restore(program: Programme) {
    const confirmed = await confirmModal({
      title: 'فعال‌کردن برنامهٔ قبلی',
      message: `«${program.title}» دوباره برنامهٔ فعال می‌شود و خرید قبلی همین برنامه حفظ خواهد شد. برنامهٔ فعال فعلی در بایگانی می‌ماند؛ تغییرات ذخیره‌نشدهٔ فرم کنار گذاشته می‌شوند. ادامه می‌دهید؟`,
      confirmText: 'فعال‌کردن برنامه', cancelText: 'انصراف',
    });
    if (!confirmed) return;
    setBusy(true); setError('');
    try {
      const response = await api<{ program: Programme }>('POST', `/students/${studentId}/programs/restore`, {
        offerId: program.id, offerVersion: program.version,
        expectedId: currentProgram?.id ?? null, expectedVersion: currentProgram?.version ?? 0,
      });
      onRestore(response.program);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'فعال‌کردن برنامه ممکن نشد.');
    } finally { setBusy(false); }
  }

  return (
    <details className="coach-programme-archive panel-card" onToggle={(event) => { if (event.currentTarget.open && !loaded && !busy) void load(); }}>
      <summary><ArchiveRestore size={18} /><span><strong>برنامه‌های قبلی این شاگرد</strong><small>فعال‌سازی دوباره و ویرایش بدون فروش مجدد همان برنامه</small></span></summary>
      <div className="coach-programme-archive__body">
        <p>فقط برنامه‌های متعلق به مربی فعلی نمایش داده می‌شوند. برنامه‌های مربیان دیگر برای شما قابل مشاهده نیستند.</p>
        {error && <div className="account-load-error" role="alert"><p>{error}</p><button type="button" className="button button--secondary button--small" onClick={() => void load()}><RefreshCw size={14} /> تلاش دوباره</button></div>}
        {busy && <p className="account-muted">در حال بررسی…</p>}
        {loaded && !busy && programs.length === 0 && <p className="account-muted">برنامهٔ قبلی دیگری برای این شاگرد ثبت نشده است.</p>}
        {programs.map((program) => <article className="coach-programme-archive__item" key={program.id}>
          <div><strong>{program.title}</strong><small>{faNumber(program.days.length)} روز · {(program.priceTomans ?? 0) > 0 ? `${faNumber(program.priceTomans!)} تومان` : 'رایگان'}</small></div>
          <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void restore(program)}>فعال‌کردن این برنامه</button>
        </article>)}
        {cursor && <button type="button" className="button button--ghost button--small" disabled={busy} onClick={() => void load(cursor)}>نمایش بیشتر</button>}
      </div>
    </details>
  );
}
