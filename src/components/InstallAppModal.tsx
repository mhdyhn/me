import { useEffect, useState } from 'react';
import { Download, Smartphone, X, Check, Apple, FileBox, ShieldAlert } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'apk' | 'ios'>('pwa');

  useEffect(() => {
    // Check if already installed in standalone mode safely
    const isStandalone = typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)').matches
      : Boolean((window.navigator as unknown as { standalone?: boolean })?.standalone);
    setIsInstalled(isStandalone);

    // Detect iOS
    const userAgent = (window.navigator?.userAgent ?? '').toLowerCase();
    const isAppleDevice = /iphone|ipad|ipod/.test(userAgent);
    if (isAppleDevice) {
      setActiveTab('ios');
    }

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
              <h2 style={{ fontSize: 18, margin: 0 }}>نصب مستقیم اپلیکیشن روی گوشی</h2>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>اجرای سریع، تمام‌صفحه و بدون نیاز به ورود به مرورگر</p>
            </div>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose} aria-label="بستن">
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="install-tabs" style={{ display: 'flex', gap: 6, margin: '16px 0', borderBottom: '1px solid var(--line-soft)', paddingBottom: 10, overflowX: 'auto' }}>
          <button
            type="button"
            className={`button button--small ${activeTab === 'pwa' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('pwa')}
          >
            <Smartphone size={14} /> نصب مستقیم روی گوشی (یک‌کلیک)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'apk' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('apk')}
          >
            <FileBox size={14} /> دانلود فایل نصبی (APK)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'ios' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('ios')}
          >
            <Apple size={14} /> راهنمای آیفون (iOS)
          </button>
        </div>

        {/* ================= TAB 1: PWA (DIRECT INSTALL - NO EXTERNAL SITES) ================= */}
        {activeTab === 'pwa' && (
          <div className="install-tab-pane">
            {isInstalled ? (
              <div className="banner-success" style={{ padding: 14, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(217, 246, 111, 0.1)', color: 'var(--accent)', border: '1px solid rgba(217, 246, 111, 0.2)' }}>
                <Check size={20} />
                <span>اپلیکیشن روی این دستگاه با موفقیت نصب شده و در صفحهٔ برنامه‌های گوشی قرار دارد!</span>
              </div>
            ) : deferredPrompt ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <p style={{ fontSize: 14, marginBottom: 16, lineHeight: 1.6 }}>
                  با لمس دکمهٔ زیر، اپلیکیشن میتی مستقیماً و بدون نیاز به دانلود هیچ فایلی روی گوشی شما نصب می‌شود:
                </p>
                <button type="button" className="button button--primary button--large button--full" onClick={() => void handleInstallClick()} style={{ fontSize: 15, padding: '14px 20px', justifyContent: 'center' }}>
                  <Smartphone size={19} /> نصب مستقیم و فوری اپلیکیشن
                </button>
              </div>
            ) : (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <button type="button" className="button button--primary button--large button--full" onClick={() => void handleInstallClick()} style={{ fontSize: 15, padding: '14px 20px', justifyContent: 'center' }}>
                    <Smartphone size={19} /> نصب مستقیم اپلیکیشن روی گوشی
                  </button>
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10, color: 'var(--muted)' }}>
                  اگر دکمه بالا منوی نصب را باز نکرد، در مرورگر کروم یا سامسونگ اینترنت گوشی:
                </p>
                <ol style={{ paddingRight: 20, margin: 0, display: 'grid', gap: 8, fontSize: 12, lineHeight: 1.6 }}>
                  <li>روی <strong>منوی ۳ نقطه</strong> مرورگر گوشی ضربه بزنید.</li>
                  <li>گزینهٔ <strong>«نصب برنامه» (Install App)</strong> یا <strong>«افزودن به صفحه اصلی» (Add to Home screen)</strong> را انتخاب کنید.</li>
                  <li>با زدن <strong>نصب (Install)</strong>، آیکون میتی به جمع برنامه‌های گوشی افزوده می‌شود.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: DIRECT APK DOWNLOAD (SAME ORIGIN - NO GITHUB PAGE) ================= */}
        {activeTab === 'apk' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              دانلود مستقیم فایل بستهٔ نصبی اندروید (<strong dir="ltr">meety.apk</strong>) با سرور اختصاصی، بدون باز شدن صفحات خارجی:
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              <a
                href="/meety.apk"
                download="meety.apk"
                className="button button--primary button--full"
                style={{ textAlign: 'center', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
              >
                <Download size={18} /> دریافت مستقیم فایل meety.apk
              </a>

              <div style={{ background: 'var(--panel-soft)', padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.7 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-strong)', marginBottom: 4 }}>
                  <ShieldAlert size={14} /> راهنمای نصب پس از دانلود:
                </strong>
                <ol style={{ paddingRight: 18, margin: 0 }}>
                  <li>پس از اتمام دانلود فایل، آن را از نوار اعلان‌ها یا پوشهٔ دانلودها (Downloads) باز کنید.</li>
                  <li>در صورت درخواست مجوز، گزینهٔ <strong>«اجازه نصب از این منبع» (Install unknown apps)</strong> را فعال کنید.</li>
                  <li>روی <strong>«نصب» (Install)</strong> بزنید.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: IOS / SAFARI ================= */}
        {activeTab === 'ios' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              در گوشی‌های آیفون و مرورگر <strong>Safari</strong>، برای نصب مستقل برنامه در صفحهٔ اصلی:
            </p>
            <ol style={{ paddingRight: 20, margin: 0, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6 }}>
              <li>
                در نوار پایین مرورگر Safari، دکمهٔ <strong>اشتراک‌گذاری (Share ⎋)</strong> را لمس کنید.
              </li>
              <li>
                در منوی باز شده گزینهٔ <strong>«Add to Home Screen» (افزودن به صفحهٔ اصلی ⊞)</strong> را انتخاب کنید.
              </li>
              <li>
                در بالا سمت راست روی <strong>«Add»</strong> بزنید. اپلیکیشن میتی بدون نوار آدرس روی صفحه گوشی نصب می‌شود.
              </li>
            </ol>
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
