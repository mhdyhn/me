import { useState } from 'react';
import { confirmModal } from './ConfirmModal';
import { usePersonalSyncState } from './PersonalSync';
import { personalKindLabel } from '../lib/personalKindLabel';
import { resolvePersonalConflict, schedulePersonalSync, type PersonalConflict } from '../lib/personalSync';
import { useSession } from '../context/SessionContext';

export function PersonalDataPanel() {
  const { user } = useSession();
  const sync = usePersonalSyncState();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!user || import.meta.env.MODE === 'offline') return null;

  async function resolve(conflict: PersonalConflict, choice: 'local' | 'server') {
    const label = choice === 'local' ? 'دستگاه' : 'سرور';
    if (!await confirmModal({ title: 'انتخاب نسخهٔ اطلاعات', message: `نسخهٔ ${label} برای «${personalKindLabel[conflict.kind]}» جایگزین نسخهٔ دیگر شود؟ ابتدا محتوای هر دو را بررسی کنید.`, confirmText: `انتخاب نسخهٔ ${label}`, cancelText: 'انصراف', variant: 'danger' })) return;
    setBusy(true); setMessage('');
    try { await resolvePersonalConflict(conflict, choice); setMessage('نسخهٔ انتخاب‌شده ثبت شد.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'حل تعارض انجام نشد.'); schedulePersonalSync(); }
    finally { setBusy(false); }
  }


  return (
    <section className="panel-card personal-sync-panel" aria-labelledby="personal-sync-title">
      <span className="eyebrow">اطلاعات روی همهٔ دستگاه‌ها</span>
      <h2 id="personal-sync-title">همگام‌سازی حساب</h2>
      <p role="status">{sync.message || 'در انتظار اتصال به سرور.'}</p>
      <p className="muted small-text">پروفایل، برنامهٔ شخصی، جلسه‌ها، وزن، هدف‌ها و داده‌های سلامت به حساب همین کاربر متصل می‌شوند. هنگام قطع اتصال تغییرات روی دستگاه می‌مانند تا دوباره همگام شوند.</p>
      {sync.conflicts.map((conflict) => (
        <article className="personal-sync-conflict" key={conflict.id}>
          <strong>{personalKindLabel[conflict.kind]}{conflict.key !== 'main' ? ` · ${conflict.key}` : ''}</strong>
          <p>این مورد در دستگاه و سرور متفاوت است؛ پیش از انتخاب، هر دو نسخه را بررسی کن.</p>
          <details><summary>بررسی نسخهٔ این دستگاه</summary><pre dir="auto">{conflict.local.deleted ? 'حذف شده' : JSON.stringify(conflict.local.value, null, 2)}</pre></details>
          <details><summary>بررسی نسخهٔ سرور</summary><pre dir="auto">{!conflict.remote || conflict.remote.deleted ? 'حذف شده یا موجود نیست' : JSON.stringify(conflict.remote.value, null, 2)}</pre></details>
          <div className="personal-sync-actions">
            <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void resolve(conflict, 'local')}>انتخاب نسخهٔ دستگاه</button>
            <button type="button" className="button button--secondary button--small" disabled={busy} onClick={() => void resolve(conflict, 'server')}>انتخاب نسخهٔ سرور</button>
          </div>
        </article>
      ))}
      <div className="personal-sync-actions">
        <button type="button" className="button button--secondary button--small" disabled={busy || sync.phase === 'syncing'} onClick={schedulePersonalSync}>تلاش دوباره</button>
      </div>
      {message && <p role="status" className="small-text">{message}</p>}
    </section>
  );
}
