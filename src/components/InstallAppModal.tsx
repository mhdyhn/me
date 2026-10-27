import { useEffect, useState } from 'react';
import { Download, Smartphone, X, Check, Apple, FileBox, ShieldAlert } from 'lucide-react';
import { useModalFocus } from './useModalFocus';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Only explicitly configured same-origin paths or HTTPS URLs can advertise an APK. */
function configuredApkUrl(value: string | undefined): string | null {
  const url = value?.trim();
  if (!url || /[\u0000-\u001f\\]/.test(url)) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : null;
  } catch {
    return null;
  }
}

export function InstallAppModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<'pwa' | 'apk' | 'ios'>('pwa');
  const dialogRef = useModalFocus(isOpen, onClose);
  const apkUrl = configuredApkUrl(import.meta.env.VITE_ANDROID_APK_URL);

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
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
      <div className="modal-content install-modal" ref={dialogRef} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="brand-mark" style={{ width: 34, height: 34 }}>
              <Smartphone size={18} />
            </span>
            <div>
              <h2 id="install-modal-title" style={{ fontSize: 18, margin: 0 }}>نصب مستقیم اپلیکیشن روی گوشی</h2>
              <p className="muted" style={{ fontSize: 12, margin: '2px 0 0' }}>اجرای سریع، تمام‌صفحه و بدون نیاز به ورود به مرورگر</p>
            </div>
          </div>
          <button type="button" className="button button--ghost" data-initial-focus onClick={onClose} aria-label="بستن">
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
                <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10, color: 'var(--muted)' }}>
                  نصب خودکار در این مرورگر در دسترس نیست. در کروم یا سامسونگ اینترنت گوشی می‌توانی از منوی مرورگر نصب کنی:
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
              {apkUrl ? 'فایل اندروید را فقط از نشانی تأییدشدهٔ ارائه‌دهنده دریافت کنید.' : 'فایل اندروید تأییدشده برای این نسخه پیکربندی نشده است؛ فعلاً نسخهٔ وب نصب‌پذیر را استفاده کنید.'}
            </p>

            <div style={{ display: 'grid', gap: 12 }}>
              {apkUrl && <a
                href={apkUrl}
                download="meety.apk"
                rel="noopener noreferrer"
                className="button button--primary button--full"
                style={{ textAlign: 'center', justifyContent: 'center', padding: '12px 16px', fontSize: 14 }}
              >
                <Download size={18} /> دریافت فایل اندروید
              </a>}

              {/* Downloaded packages should be verified rather than bypassing OS warnings. */}
              <div style={{ background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.28)', padding: 14, borderRadius: 12, fontSize: 12.5, lineHeight: 1.75 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#684b10', marginBottom: 6, fontSize: 13 }}>
                  <ShieldAlert size={16} /> امنیت فایل نصبی اندروید
                </strong>
                <p style={{ margin: 0, color: 'var(--text)' }}>
                  پیش از نصب فایل خارج از فروشگاه، منبع و امضای آن را بررسی کنید. اگر Play Protect هشدار داد، آن را نادیده نگیرید؛ در صورت تردید از نسخهٔ وب نصب‌پذیر استفاده کنید.
                </p>
              </div>

              {/* Recommendation to use 1-click PWA */}
              <div style={{ background: 'rgba(217, 246, 111, 0.08)', border: '1px solid rgba(217, 246, 111, 0.22)', padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.7 }}>
                <strong style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', marginBottom: 4 }}>
                  <Smartphone size={14} /> گزینهٔ نصب از مرورگر:
                </strong>
                <p style={{ margin: 0, color: 'var(--text)' }}>
                  اگر ترجیح می‌دهید هیچ هشدار امنیتی مشاهده نکنید، از تب اول در بالا یعنی <strong>«نصب مستقیم روی گوشی (یک‌کلیک)»</strong> استفاده کنید؛ در مرورگرهای پشتیبانی‌شده می‌توانید آن را به صفحهٔ اصلی اضافه کنید.
                </p>
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
