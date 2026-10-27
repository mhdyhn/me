import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  CalendarDays,
  Dumbbell,
  House,
  ListPlus,
  Menu,
  MessageCircle,
  Receipt,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Utensils,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { InstallAppModal } from './InstallAppModal';
import { useModalFocus } from './useModalFocus';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { usePersonalSyncState } from './PersonalSync';
import { useMotivationalQuote } from '../lib/motivationalQuotes';
import type { Role } from '../lib/api';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { getAssignedMeta, setAssignedMeta, setAssignedProgram, useAssignedMeta } from '../lib/programStore';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  desc?: string;
}

/** Keep the fixed navigation focused on the primary job for each role. */
const studentPrimaryTabs: NavItem[] = [
  { label: 'خانه', to: '/', icon: House, end: true },
  { label: 'برنامه', to: '/program', icon: CalendarDays },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
];
const coachPrimaryTabs: NavItem[] = [
  { label: 'شاگردها', to: '/coach', icon: Users, end: true },
  { label: 'برنامه‌سازی', to: '/coach/programs/new', icon: ListPlus },
  { label: 'درآمدها', to: '/coach/transactions', icon: Receipt },
];
const adminPrimaryTabs: NavItem[] = [
  { label: 'مربی‌ها', to: '/coach', icon: ShieldCheck, end: true },
  { label: 'مالی باشگاه', to: '/coach/admin/transactions', icon: Receipt },
];

const personalSecondaryNavigation: NavItem[] = [
  { label: 'حرکت‌ها', to: '/exercises', icon: Dumbbell, desc: 'کتابخانه و راهنمای اجرای حرکت‌ها' },
  { label: 'هوش سلامتی', to: '/ai-hub', icon: Sparkles, desc: 'پایش آمادگی و ریکاوری' },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils, desc: 'برنامه و دفتر خوراک' },
];
const roleSecondaryNavigation: Record<Role, NavItem[]> = {
  student: [{ label: 'مربی', to: '/chat', icon: MessageCircle, desc: 'گفتگو و ارسال پیام به مربی' }],
  coach: [{ label: 'گفتگو با مدیر', to: '/coach/chat', icon: MessageCircle, desc: 'ارتباط با مدیر باشگاه' }],
  admin: [],
};
const settingsNavigation: NavItem = { label: 'تنظیمات', to: '/settings', icon: Settings2, desc: 'پروفایل و شخصی‌سازی' };

const personalTitles: Record<string, string> = {
  '/': 'تمرین امروزت',
  '/program': 'برنامه تمرینی',
  '/exercises': 'راهنمای حرکت‌ها',
  '/ai-hub': 'اکوسیستم هوش سلامتی و عملکرد',
  '/progress': 'پیشرفت و سوابق',
  '/nutrition': 'تغذیه',
  '/settings': 'پروفایل و تنظیمات',
  '/chat': 'گفتگو با مربی',
};

export function Layout() {
  const location = useLocation();
  const { activeSession, storageWarning } = useGym();
  const { user, signOut } = useSession();
  const assignedMeta = useAssignedMeta();
  const personalSync = usePersonalSyncState();
  const quote = useMotivationalQuote();
  const navigate = useNavigate();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const moreSheetRef = useModalFocus(showMoreSheet, () => setShowMoreSheet(false));

  const primaryTabs = user?.role === 'coach'
    ? coachPrimaryTabs
    : user?.role === 'admin'
      ? adminPrimaryTabs
      : studentPrimaryTabs;
  const roleItems = user ? roleSecondaryNavigation[user.role] : [];
  const secondaryItems = [
    ...(user?.role !== 'student' ? [{ label: 'برنامهٔ شخصی', to: '/program', icon: CalendarDays, desc: 'برنامه تمرینی شخصی' }] : []),
    ...personalSecondaryNavigation,
    ...roleItems,
    settingsNavigation,
  ];
  // Screens that bring their own heading (coach screens, a student's coach program and movements).
  const ownHeading = location.pathname.startsWith('/coach') || (user?.role === 'student' && (location.pathname === '/program' || location.pathname === '/exercises' || location.pathname === '/chat'));

  // Test access is temporary. Recheck it on focus, periodically, and at its deadline.
  useEffect(() => {
    if (user?.role !== 'student' || !assignedMeta?.isTestPurchase || !assignedMeta.testPurchaseExpiresAt) return;
    const programId = assignedMeta.id;
    const expiry = Date.parse(assignedMeta.testPurchaseExpiresAt);
    const recheck = () => {
      const current = getAssignedMeta();
      if (!current?.isTestPurchase || current.id !== programId) return;
      if (Number.isFinite(expiry) && Date.now() >= expiry) {
        setAssignedMeta({ ...current, isTestPurchase: false, testPurchaseAvailable: false });
        setAssignedProgram([]);
      }
      void loadAssignedProgram();
    };
    window.addEventListener('focus', recheck);
    const interval = window.setInterval(recheck, 60_000);
    const remaining = expiry - Date.now();
    // A fast device clock can put the server's deadline in the past; avoid an immediate retry loop.
    const deadline = Number.isFinite(remaining) && remaining > 0 ? window.setTimeout(recheck, remaining + 250) : undefined;
    return () => {
      window.removeEventListener('focus', recheck);
      window.clearInterval(interval);
      if (deadline !== undefined) window.clearTimeout(deadline);
    };
  }, [user?.id, user?.role, assignedMeta?.id, assignedMeta?.isTestPurchase, assignedMeta?.testPurchaseExpiresAt]);

  // Close more sheet automatically on route change
  useEffect(() => {
    setShowMoreSheet(false);
  }, [location.pathname]);

  // Update document title for SEO & usability
  useEffect(() => {
    const baseTitle = 'میتی — مربی تمرین باشگاه';
    let pageTitle = personalTitles[location.pathname];
    if (location.pathname.startsWith('/exercise/')) {
      pageTitle = 'راهنمای حرکت';
    } else if (location.pathname.startsWith('/coach/students/')) {
      pageTitle = 'مدیریت شاگرد';
    } else if (location.pathname === '/coach') {
      pageTitle = user?.role === 'admin' ? 'مدیریت باشگاه و مربی‌ها' : 'شاگردهای من';
    } else if (location.pathname === '/coach/programs/new') {
      pageTitle = 'افزودن برنامه تمرینی';
    } else if (location.pathname.includes('/transactions')) {
      pageTitle = 'تراکنش‌ها و درآمدها';
    } else if (location.pathname.startsWith('/workout/')) {
      pageTitle = 'تمرین در حال انجام';
    }

    if (pageTitle) {
      document.title = `${pageTitle} | ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  }, [location.pathname, user?.role]);

  async function signOutAndLeave() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const title = ownHeading ? null : personalTitles[location.pathname] ?? (location.pathname.startsWith('/exercise/') ? 'راهنمای حرکت' : 'تمرین در حال انجام');

  // Check if current page is one of the secondary items inside "بیشتر"
  const isPrimaryActive = primaryTabs.some((tab) => tab.end
    ? location.pathname === tab.to
    : location.pathname === tab.to || location.pathname.startsWith(`${tab.to}/`));
  const isMoreActive = !isPrimaryActive && location.pathname !== '/workout';
  const sidebarSecondaryItems = secondaryItems.filter((item) => item.to !== settingsNavigation.to);

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="نوار کناری">
        <NavLink to="/" className="brand-lockup" aria-label="رفتن به خانهٔ میتی">
          <span className="brand-mark"><Dumbbell size={20} strokeWidth={2.3} /></span>
          <span><strong>میتی</strong><small>مربی تمرین شخصی</small></span>
        </NavLink>
        <p className="sidebar-label">منو</p>
        <nav className="side-nav" aria-label="ناوبری اصلی">
          {primaryTabs.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
            </NavLink>
          ))}
          <details className="side-nav-more" open={sidebarSecondaryItems.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`))}>
            <summary><Menu size={18} /><span>بخش‌های دیگر</span></summary>
            <div className="side-nav-more__items">
              {sidebarSecondaryItems.map(({ label, to, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
                  <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
                </NavLink>
              ))}
            </div>
          </details>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-coach-note">
            <span className="note-mark"><Zap size={15} fill="currentColor" /></span>
            <p><strong>{quote.title}</strong><br />{quote.subtitle}</p>
        </div>
        <button
          type="button"
          className="sidebar-install-pill"
          onClick={() => setShowInstallModal(true)}
        >
          <Smartphone size={16} /><span>نصب روی گوشی (APK)</span>
        </button>
        <NavLink to="/settings" className={({ isActive }) => `nav-link settings-link${isActive ? ' is-active' : ''}`}>
          <Settings2 size={18} /><span>پروفایل و تنظیمات</span>
        </NavLink>
        <div className="sidebar-footer"><span className="status-dot" /> ذخیره‌شده روی این دستگاه</div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="mobile-brand"><span className="brand-mark"><Dumbbell size={17} /></span> میتی</span>
            <span className="eyebrow topbar-eyebrow">مربی تمرین شخصی</span>
            {title && <h1>{title}</h1>}
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              className="install-topbar-pill"
              aria-label="نصب اپلیکیشن روی گوشی"
              onClick={() => setShowInstallModal(true)}
              title="نصب اپلیکیشن روی گوشی (فایل نصبی و PWA)"
            >
              <Smartphone size={14} /> <span>نصب اپلیکیشن</span>
            </button>
            {activeSession && location.pathname !== `/workout/${activeSession.templateId}` && (
              <NavLink className="resume-pill" to={`/workout/${activeSession.templateId}`}>
                <span className="resume-dot" /> ادامهٔ تمرین
              </NavLink>
            )}
            {user ? (
              <button type="button" className="account-entry" title={`خروج ${user.displayName}`} onClick={() => void signOutAndLeave()}>
                <span className="account-entry__text">خروج {user.displayName}</span>
              </button>
            ) : (
              <NavLink to="/login" className="account-entry" title="ورود مربی یا شاگرد">
                <span className="account-entry__text">ورود مربی یا شاگرد</span>
              </NavLink>
            )}
            <NavLink to="/settings" className="profile-button" aria-label="بازکردن پروفایل و تنظیمات">
              <span className="profile-avatar">م</span>
              <span className="profile-button__text">پروفایل من</span>
            </NavLink>
          </div>
        </header>

        {user?.role === 'student' && assignedMeta?.isTestPurchase && (
          <div className="test-purchase-notice" role="status">دسترسی این برنامه آزمایشی است؛ پرداخت واقعی انجام نشده و دسترسی پس از پایان مهلت یا تنظیم درگاه واقعی قطع می‌شود.</div>
        )}
        {storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}
        {user && ['offline', 'conflict', 'error'].includes(personalSync.phase) && <div className="storage-warning" role="status">{personalSync.message} <NavLink to="/settings">بررسی همگام‌سازی</NavLink></div>}
        <main className="page-content" id="main-content"><Outlet /></main>
      </div>

      <nav className="mobile-nav" aria-label="ناوبری موبایل">
        <div className="mobile-nav__bar" style={{ gridTemplateColumns: `repeat(${primaryTabs.length + 1}, minmax(0, 1fr))` }}>
          {primaryTabs.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}>
              <Icon size={20} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`mobile-nav__item${isMoreActive ? ' is-active' : ''}`}
            onClick={() => setShowMoreSheet(true)}
            aria-expanded={showMoreSheet}
            aria-controls="mobile-more-sheet"
            aria-label="سایر بخش‌ها و امکانات"
          >
            <Menu size={20} strokeWidth={1.9} />
            <span>بیشتر</span>
            {isMoreActive && <span className="mobile-nav__more-dot" />}
          </button>
        </div>

        {/* A closed sheet is removed from the accessibility tree and keyboard order. */}
        {showMoreSheet && <>
        <div
          aria-hidden="true"
          className="mobile-sheet-backdrop is-open"
          onClick={() => setShowMoreSheet(false)}
        />
        <div
          id="mobile-more-sheet"
          ref={moreSheetRef}
          tabIndex={-1}
          className="mobile-sheet is-open"
          role="dialog"
          aria-modal="true"
          aria-label="سایر بخش‌ها و امکانات میتی"
        >
          <div className="mobile-sheet__handle" aria-hidden="true" />
          <div className="mobile-sheet__head">
            <span className="mobile-sheet__title">سایر بخش‌ها و امکانات میتی</span>
            <button
              type="button"
              className="mobile-sheet__close"
              data-initial-focus
              onClick={() => setShowMoreSheet(false)}
              aria-label="بستن منو"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mobile-sheet__body">
            <div className="mobile-sheet__section">
              <div className="mobile-sheet__group-label">{user?.role === 'coach' ? 'امکانات مربی' : user?.role === 'admin' ? 'امکانات مدیریت' : 'امکانات بیشتر'}</div>
              <div className="mobile-sheet__grid">
                {secondaryItems.map(({ label, to, icon: Icon, desc }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `mobile-sheet__card${isActive ? ' is-active' : ''}`}
                    onClick={() => setShowMoreSheet(false)}
                  >
                    <span className="mobile-sheet__card-icon"><Icon size={20} /></span>
                    <div className="mobile-sheet__card-info">
                      <strong className="mobile-sheet__card-title">{label}</strong>
                      {desc && <span className="mobile-sheet__card-desc">{desc}</span>}
                    </div>
                  </NavLink>
                ))}
                <button
                  type="button"
                  className="mobile-sheet__card"
                  onClick={() => {
                    setShowMoreSheet(false);
                    setShowInstallModal(true);
                  }}
                >
                  <span className="mobile-sheet__card-icon"><Smartphone size={20} /></span>
                  <div className="mobile-sheet__card-info">
                    <strong className="mobile-sheet__card-title">نصب اپلیکیشن</strong>
                    <span className="mobile-sheet__card-desc">نسخهٔ نصب‌شدنی و وب</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
        </>}
      </nav>

      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
