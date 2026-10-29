import { confirmModal } from './ConfirmModal';

export function SessionDraftRecovery({ invalid, onRestore, onDiscard }: { invalid: boolean; onRestore: () => void; onDiscard: () => void }) {
  const discard = async () => {
    if (await confirmModal({
      title: 'کنار گذاشتن پیش‌نویس',
      message: 'پیش‌نویس این زبانه حذف شود؟ اطلاعاتی که قبلاً ذخیره شده‌اند تغییر نمی‌کنند.',
      confirmText: 'کنار گذاشتن پیش‌نویس', cancelText: 'انصراف', variant: 'warning',
    })) onDiscard();
  };
  return <section className="session-draft-recovery panel-card" role="alert">
    <strong>{invalid ? 'پیش‌نویس قبلی قابل خواندن نیست.' : 'پیش‌نویس ذخیره‌نشده پیدا شد.'}</strong>
    <p>{invalid
      ? 'نسخهٔ محلی دست‌نخورده مانده است. برای شروع دوباره باید کنار گذاشتن آن را تأیید کنی.'
      : 'این نسخه فقط در همین زبانه نگه داشته شده و هنوز به‌عنوان اطلاعات اصلی ذخیره نشده است. بازیابی را انتخاب کن یا آن را کنار بگذار.'}</p>
    <div className="session-draft-actions">
      {!invalid && <button type="button" className="button button--primary button--small" onClick={onRestore}>ادامهٔ پیش‌نویس</button>}
      <button type="button" className="button button--secondary button--small" onClick={() => void discard()}>کنار گذاشتن پیش‌نویس</button>
    </div>
  </section>;
}

export function SessionDraftStatus({ dirty, storage }: { dirty: boolean; storage: 'idle' | 'saved' | 'failed' }) {
  if (!dirty && storage !== 'failed') return null;
  return <p className={`session-draft-status${storage === 'failed' ? ' session-draft-status--warning' : ''}`} aria-live="polite">
    {storage === 'failed'
      ? dirty ? 'نگهداری نسخهٔ موقت در مرورگر ممکن نشد. پیش از خروج، تغییرات را ذخیره کن.' : 'حذف نسخهٔ موقت ممکن نشد؛ ممکن است پیش‌نویس قدیمی دوباره نمایش داده شود.'
      : storage === 'saved'
        ? 'تغییرات هنوز ذخیره نشده‌اند؛ نسخهٔ موقت فقط در همین زبانه است و با بستن آن ممکن است پاک شود.'
        : 'تغییرات هنوز ذخیره نشده‌اند.'}
  </p>;
}
