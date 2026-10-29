import type { ReactNode } from 'react';
import { confirmModal } from './ConfirmModal';

export function DraftConflictNotice({ latest, preview, discard, acceptCurrent }: { latest: unknown; preview?: ReactNode; discard: () => void; acceptCurrent: () => void }) {
  const confirmDiscard = async () => {
    if (await confirmModal({ title: 'کنار گذاشتن پیش‌نویس', message: 'پیش‌نویس ذخیره‌نشده کنار گذاشته و نسخهٔ تازه بارگذاری شود؟', confirmText: 'بارگذاری نسخهٔ تازه', cancelText: 'انصراف', variant: 'warning' })) discard();
  };
  const confirmKeep = async () => {
    if (await confirmModal({ title: 'نگه‌داشتن پیش‌نویس', message: 'نسخهٔ تازه را بررسی کرده‌ای؟ با ذخیرهٔ بعدی، پیش‌نویس تو جایگزین آن می‌شود؛ اگر دوباره تغییر کند، هشدار دیگری می‌بینی.', confirmText: 'تأیید پیش‌نویس من', cancelText: 'انصراف', variant: 'warning' })) acceptCurrent();
  };
  return (
    <div className="draft-conflict" role="alert">
      <strong>این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است.</strong>
      <p>پیش‌نویس تو حفظ شده؛ پیش از ذخیره، نسخهٔ تازه را بررسی و انتخاب کن.</p>
      <details><summary>بررسی نسخهٔ تازه</summary>{preview ?? <pre dir="auto">{latest == null ? 'موجود نیست یا حذف شده' : JSON.stringify(latest, null, 2)}</pre>}</details>
      <div className="personal-sync-actions">
        <button type="button" className="button button--secondary button--small" onClick={() => void confirmDiscard()}>استفاده از نسخهٔ تازه</button>
        <button type="button" className="button button--secondary button--small" onClick={() => void confirmKeep()}>نگه‌داشتن پیش‌نویس من</button>
      </div>
    </div>
  );
}
