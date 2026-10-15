import { useEffect, useState } from 'react';
import { Download, Smartphone, X, Check, Apple, ExternalLink, HelpCircle } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'ios' | 'offline'>('pwa');

  useEffect(() => {
    // Check if already installed in standalone mode safely
    const isStandalone = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone);
    setIsInstalled(isStandalone);

    // Detect iOS
    const userAgent = (window.navigator?.userAgent ?? '').toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isAppleDevice) setActiveTab('ios');

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  if (!isOpen) return null;

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content install-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" style={{ width: 34, height: 34 }}>
              <Smartphone size={18} />
            </span>
            <div>
              <h2 style={{ fontSize: 18, margin: 0 }}>نصب اپلیکیشن میتی روی گوشی</h2>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>دسترسی سریع، تمام‌صفحه و بدون نیاز به مرورگر</p>
            </div>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose} aria-label="بستن">
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="install-tabs" style={{ display: 'flex', gap: 8, margin: '16px 0', borderBottom: '1px solid var(--line-soft)', paddingBottom: 10 }}>
          <button
            type="button"
            className={`button button--small ${activeTab === 'pwa' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('pwa')}
          >
            <Smartphone size={15} /> نصب اندروید / کروم
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'ios' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('ios')}
          >
            <Apple size={15} /> راهنمای آیفون (iOS)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'offline' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('offline')}
          >
            <Download size={15} /> نسخهٔ آفلاین تک‌فایلی
          </button>
        </div>

        {/* ================= TAB 1: PWA (ANDROID / CHROME) ================= */}
        {activeTab === 'pwa' && (
          <div className="install-tab-pane">
            {isInstalled ? (
              <div className="banner-success" style={{ padding: 14, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(217, 246, 111, 0.1)', color: 'var(--accent)', border: '1px solid rgba(217, 246, 111, 0.2)' }}>
                <Check size={20} />
                <span>اپلیکیشن روی این دستگاه با موفقیت نصب شده و در حالت تمام‌صفحه در دسترس است!</span>
              </div>
            ) : deferredPrompt ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ fontSize: 14, marginBottom: 16 }}>
                  با زدن دکمه زیر، اپلیکیشن به صورت مستقیم و با آیکون اختصاصی روی صفحه گوشی شما نصب می‌شود:
                </p>
                <button type="button" className="button button--primary button--full" onClick={() => void handleInstallClick()} style={{ fontSize: 15, padding: '12px 20px' }}>
                  <Smartphone size={18} /> نصب مستقیم برنامه روی گوشی
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>
                  برای نصب در مرورگر Chrome یا Samsung Internet گوشی:
                </p>
                <ol style={{ paddingRight: 22, margin: 0, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6 }}>
                  <li>روی <strong>منوی ۳ نقطه</strong> در گوشه بالا یا پایین مرورگر ضربه بزنید.</li>
                  <li>گزینهٔ <strong>«نصب برنامه» (Install App)</strong> یا <strong>«افزودن به صفحه اصلی» (Add to Home screen)</strong> را انتخاب کنید.</li>
                  <li>در پنجرهٔ باز شده، روی <strong>نصب (Install)</strong> بزنید.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: IOS / SAFARI ================= */}
        {activeTab === 'ios' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 14 }}>
              در گوشی‌های آیفون و مرورگر <strong>Safari</strong>، مراحل زیر را طی کنید:
            </p>
            <ol style={{ paddingRight: 22, margin: 0, display: 'grid', gap: 12, fontSize: 13, lineHeight: 1.6 }}>
              <li>
                در نوار پایین مرورگر Safari، روی دکمهٔ <strong>اشتراک‌گذاری (Share)</strong> <ExternalLink size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> ضربه بزنید.
              </li>
              <li>
                در منوی باز شده به پایین اسکرول کرده و گزینهٔ <strong>«Add to Home Screen» (افزودن به صفحهٔ اصلی)</strong> را انتخاب کنید.
              </li>
              <li>
                در گوشهٔ بالا روی دکمهٔ <strong>«Add»</strong> بزنید. آیکون برنامه <strong>میتی</strong> مستقیماً در کنار سایر برنامه‌های گوشی شما ظاهر خواهد شد.
              </li>
            </ol>
          </div>
        )}

        {/* ================= TAB 3: OFFLINE SINGLE FILE ================= */}
        {activeTab === 'offline' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              یک نسخهٔ کاملاً مستقل، آفلاین و تک‌فایلی (`meety-offline.html`) آماده شده است که تمام بانک حرکات، تایمر، برنامه‌ریزی و ثبت ست‌ها را در قالب یک فایل دارد.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <a
                href="/meety-offline.html"
                download="meety-offline.html"
                className="button button--primary button--full"
                style={{ textAlign: 'center', justifyContent: 'center' }}
              >
                <Download size={16} /> دانلود مستقیم فایل اپلیکیشن آفلاین (۱.۱ مگابایت)
              </a>
              <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                <HelpCircle size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> این فایل را می‌توانید در تلگرام یا واتساپ برای خودتان بفرستید و در هر مرورگری باز کنید. بدون نیاز به اینترنت و بدون نیاز به هیچ سروری کار می‌کند.
              </p>
            </div>
          </div>
        )}

        <div className="modal-footer" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--line-soft)', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="button button--ghost" onClick={onClose}>
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
