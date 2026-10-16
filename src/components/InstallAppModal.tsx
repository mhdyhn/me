import { useEffect, useState } from 'react';
import { Download, Smartphone, X, Check, Apple, ExternalLink, HelpCircle, FileBox, ShieldAlert } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<'apk' | 'pwa' | 'ios' | 'offline'>('apk');

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
              <h2 style={{ fontSize: 18, margin: 0 }}>نصب و دانلود اپلیکیشن میتی</h2>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>فایل نصبی اندروید (APK)، وب‌اپ PWA و راهنمای آیفون</p>
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
            className={`button button--small ${activeTab === 'apk' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('apk')}
          >
            <FileBox size={14} /> فایل نصبی اندروید (APK)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'pwa' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('pwa')}
          >
            <Smartphone size={14} /> وب‌اپ (PWA)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'ios' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('ios')}
          >
            <Apple size={14} /> راهنمای آیفون (iOS)
          </button>
          <button
            type="button"
            className={`button button--small ${activeTab === 'offline' ? 'button--primary' : 'button--ghost'}`}
            onClick={() => setActiveTab('offline')}
          >
            <Download size={14} /> فایل تک‌صفحه‌ای
          </button>
        </div>

        {/* ================= TAB 1: APK (REAL ANDROID PACKAGE) ================= */}
        {activeTab === 'apk' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              فایل نصبی استاندارد اندروید (<strong dir="ltr">.APK</strong>) ویژه گوشی‌های اندرویدی. این فایل اپلیکیشن بومی کامل میتی همراه با پایگاه داده داخلی، ابزارهای هوش مصنوعی و بیومتریک است.
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              <a
                href="https://github.com/mhdyhn/me/releases/download/v1.0.0-app/meety.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="button button--primary button--full"
                style={{ textAlign: 'center', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
              >
                <Download size={18} /> دانلود مستقیم فایل نصبی اندروید (meety.apk)
              </a>

              <a
                href="https://github.com/mhdyhn/me/actions/workflows/android-apk.yml"
                target="_blank"
                rel="noopener noreferrer"
                className="button button--secondary button--full"
                style={{ textAlign: 'center', justifyContent: 'center', fontSize: 13 }}
              >
                <ExternalLink size={15} /> مشاهده بیلدها و آرشیو APK در گیت‌هاب اکشنز
              </a>

              <div style={{ background: 'var(--panel-soft)', padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.7 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-strong)', marginBottom: 4 }}>
                  <ShieldAlert size={14} /> راهنمای نصب فایل نصبی در اندروید:
                </strong>
                <ol style={{ paddingRight: 18, margin: 0 }}>
                  <li>پس از دانلود فایل <code dir="ltr">meety.apk</code> روی گوشی، آن را از پوشه Downloads باز کنید.</li>
                  <li>در صورت نمایش پیام امنیتی، گزینهٔ <strong>«اجازه نصب از این منبع» (Install unknown apps)</strong> را فعال کنید.</li>
                  <li>روی <strong>«نصب» (Install)</strong> بزنید تا آیکون میتی مستقیماً به فهرست برنامه‌های گوشی شما اضافه شود.</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: PWA (BROWSER DIRECT INSTALL) ================= */}
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
                  بدون نیاز به دانلود فایل APK، می‌توانید برنامه را با یک کلیک مستقیماً روی صفحه گوشی نصب کنید:
                </p>
                <button type="button" className="button button--primary button--full" onClick={() => void handleInstallClick()} style={{ fontSize: 15, padding: '12px 20px' }}>
                  <Smartphone size={18} /> نصب مستقیم برنامه روی گوشی (PWA)
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
                  برای نصب بدون دانلود فایل در مرورگر کروم یا سامسونگ اینترنت گوشی:
                </p>
                <ol style={{ paddingRight: 20, margin: 0, display: 'grid', gap: 8, fontSize: 12, lineHeight: 1.6 }}>
                  <li>روی <strong>منوی ۳ نقطه</strong> در گوشه بالا یا پایین مرورگر ضربه بزنید.</li>
                  <li>گزینهٔ <strong>«نصب برنامه» (Install App)</strong> یا <strong>«افزودن به صفحه اصلی» (Add to Home screen)</strong> را انتخاب کنید.</li>
                  <li>در پنجره باز شده روی <strong>نصب (Install)</strong> بزنید.</li>
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 3: IOS / SAFARI ================= */}
        {activeTab === 'ios' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              در گوشی‌های آیفون و مرورگر <strong>Safari</strong>، مراحل زیر را طی کنید تا برنامه مانند یک اپلیکیشن بومی در صفحه‌اصلی قرار گیرد:
            </p>
            <ol style={{ paddingRight: 20, margin: 0, display: 'grid', gap: 10, fontSize: 13, lineHeight: 1.6 }}>
              <li>
                در نوار پایین مرورگر Safari، روی دکمهٔ <strong>اشتراک‌گذاری (Share)</strong> <ExternalLink size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> ضربه بزنید.
              </li>
              <li>
                در منوی باز شده به پایین اسکرول کرده و گزینهٔ <strong>«Add to Home Screen» (افزودن به صفحهٔ اصلی)</strong> را انتخاب کنید.
              </li>
              <li>
                در گوشهٔ بالا روی دکمهٔ <strong>«Add»</strong> بزنید. آیکون برنامه <strong>میتی</strong> در کنار سایر برنامه‌ها قرار می‌گیرد.
              </li>
            </ol>
          </div>
        )}

        {/* ================= TAB 4: OFFLINE SINGLE FILE ================= */}
        {activeTab === 'offline' && (
          <div className="install-tab-pane">
            <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
              نسخهٔ آفلاین تک‌فایلی (<code dir="ltr">meety-offline.html</code>) برای اجرای مستقل در کامپیوتر یا تبلت بدون نیاز به سرور و اینترنت:
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              <a
                href="/meety-offline.html"
                download="meety-offline.html"
                className="button button--secondary button--full"
                style={{ textAlign: 'center', justifyContent: 'center' }}
              >
                <Download size={16} /> دانلود فایل تک‌صفحه‌ای آفلاین (۱.۱ مگابایت)
              </a>
              <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.5 }}>
                <HelpCircle size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> این فایل را در هر مرورگری در کامپیوتر یا گوشی باز کنید، کل داده‌ها در حافظه داخلی ذخیره می‌شود.
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
