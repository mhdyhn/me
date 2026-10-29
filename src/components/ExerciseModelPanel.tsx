import { useEffect, useState, type ComponentType } from 'react';
import { Box } from 'lucide-react';

/** Keep the regular diagrams visible even if the optional 3D download fails. */
export function ExerciseModelPanel() {
  const [open, setOpen] = useState(false);
  const [Model, setModel] = useState<ComponentType | null>(null);
  const [error, setError] = useState(false);
  const offlineFile = import.meta.env.MODE === 'offline';

  useEffect(() => {
    if (!open || offlineFile) return;
    let current = true;
    setError(false);
    void import('./ExerciseModel3D').then((module) => {
      if (current) setModel(() => module.default);
    }).catch(() => { if (current) setError(true); });
    return () => { current = false; setModel(null); };
  }, [open, offlineFile]);

  return (
    <section className="exercise-3d panel-card" aria-label="نمای سه‌بعدی حرکت">
      <div className="exercise-3d__heading">
        <span className="exercise-3d__icon"><Box size={19} /></span>
        <div><span className="eyebrow">نمایش حرکت</span><h3>شنا سوئدی به‌صورت سه‌بعدی</h3></div>
      </div>
      <p>یک نمایش نمونه از حرکت است، نه ارزیابی فرم بدن. هنگام تمرین، توضیحات و راهنمای مربی را نیز بررسی کن. مدل با درخواست تو دریافت می‌شود و ممکن است حدود یک مگابایت اینترنت مصرف کند.</p>
      {offlineFile ? <p className="muted">مدل سه‌بعدی در فایل آفلاین همراه نیست؛ تصویرهای حرکت پایین صفحه در دسترس‌اند.</p> : <>
        <button type="button" className="button button--secondary button--small" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'بستن نمای سه‌بعدی' : 'نمایش حرکت سه‌بعدی'}
        </button>
        {open && (error ? <p role="alert">دریافت نمای سه‌بعدی انجام نشد؛ تصویرهای حرکت پایین صفحه در دسترس‌اند.</p> : Model ? <Model /> : <p role="status">در حال آماده‌سازی نمایشگر…</p>)}
      </>}
    </section>
  );
}
