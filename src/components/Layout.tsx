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
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { useMotivationalQuote } from '../lib/motivationalQuotes';
import type { Role } from '../lib/api';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  desc?: string;
}

/** The 4 fixed core tabs on mobile bottom bar. */
const primaryTabs: NavItem[] = [
  { label: 'خانه', to: '/', icon: House, end: true },
  { label: 'برنامه', to: '/program', icon: CalendarDays },
  { label: 'حرکت‌ها', to: '/exercises', icon: Dumbbell },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
];

/** The whole personal app: every signed-in user has it. */
const personalNavigation: NavItem[] = [
  ...primaryTabs,
  { label: 'هوش سلامتی', to: '/ai-hub', icon: Sparkles, desc: 'پایش آمادگی، ریکاوری و ضربان قلب' },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils, desc: 'اهداف کالری و دفتر خوراک روزانه' },
];

/** Extra sections added for each role. */
const roleNavigation: Record<Role, NavItem[]> = {
  student: [{ label: 'مربی', to: '/chat', icon: MessageCircle, desc: 'گفتگو و ارسال پیام به مربی' }],
  coach: [
    { label: 'شاگرد', to: '/coach', icon: Users, end: true, desc: 'فهرست و ساخت شاگردهای من' },
    { label: 'افزودن برنامه', to: '/coach/programs/new', icon: ListPlus, desc: 'طراحی برنامه تمرینی جدید' },
    { label: 'درآمدها', to: '/coach/transactions', icon: Receipt, desc: 'گزارش مالی و سهم مربی' },
    { label: 'مدیر', to: '/coach/chat', icon: MessageCircle, desc: 'گفتگو با مدیر باشگاه' },
  ],
  admin: [
    { label: 'مربی', to: '/coach', icon: ShieldCheck, end: true, desc: 'فهرست و ایجاد حساب مربیان' },
    { label: 'مالی باشگاه', to: '/coach/admin/transactions', icon: Receipt, desc: 'تراکنش‌های کلی باشگاه' },
  ],
};

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
  const quote = useMotivationalQuote();
  const navigate = useNavigate();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showMoreSheet, setShowMoreSheet] = useState(false);

  const navigation = user ? [...personalNavigation, ...roleNavigation[user.role]] : personalNavigation;
  const roleItems = user ? roleNavigation[user.role] : [];
  // Screens that bring their own heading (coach screens, a student's coach program and movements).
  const ownHeading = location.pathname.startsWith('/coach') || (user?.role === 'student' && (location.pathname === '/program' || location.pathname === '/exercises' || location.pathname === '/chat'));

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

  // Handle Escape key to close more sheet
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowMoreSheet(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  async function signOutAndLeave() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const title = ownHeading ? null : personalTitles[location.pathname] ?? (location.pathname.startsWith('/exercise/') ? 'راهنمای حرکت' : 'تمرین در حال انجام');

  // Check if current page is one of the secondary items inside "بیشتر"
  const isPrimaryActive = primaryTabs.some((tab) => (tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to)));
  const isMoreActive = !isPrimaryActive && location.pathname !== '/workout';

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="نوار کناری">
        <NavLink to="/" className="brand-lockup" aria-label="رفتن به خانهٔ میتی">
          <span className="brand-mark"><Dumbbell size={20} strokeWidth={2.3} /></span>
          <span><strong>میتی</strong><small>مربی تمرین شخصی</small></span>
        </NavLink>
        <p className="sidebar-label">منو</p>
        <nav className="side-nav" aria-label="ناوبری اصلی">
          {navigation.map(({ label, to, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <Icon size={18} strokeWidth={1.9} /><span>{label}</span>
            </NavLink>
          ))}
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
              <button type="button" className="account-entry" onClick={() => void signOutAndLeave()}>
                خروج {user.displayName}
              </button>
            ) : (
              <NavLink to="/login" className="account-entry">
                ورود مربی یا شاگرد
              </NavLink>
            )}
            <NavLink to="/settings" className="profile-button" aria-label="بازکردن پروفایل و تنظیمات">
              <span className="profile-avatar">م</span>
              <span className="profile-button__text">پروفایل من</span>
            </NavLink>
          </div>
        </header>

        {storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}
        <main className="page-content" id="main-content"><Outlet /></main>
      </div>

      <nav className="mobile-nav" aria-label="ناوبری موبایل">
        <div className="mobile-nav__bar">
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
            aria-label="سایر بخش‌ها و امکانات"
          >
            <Menu size={20} strokeWidth={1.9} />
            <span>بیشتر</span>
            {isMoreActive && <span className="mobile-nav__more-dot" />}
          </button>
        </div>

        {/* Bottom Sheet Modal for secondary items */}
        <div
          className={`mobile-sheet-backdrop${showMoreSheet ? ' is-open' : ''}`}
          onClick={() => setShowMoreSheet(false)}
        />
        <div
          className={`mobile-sheet${showMoreSheet ? ' is-open' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label="سایر بخش‌ها و امکانات میتی"
        >
          <div className="mobile-sheet__handle" onClick={() => setShowMoreSheet(false)} />
          <div className="mobile-sheet__head">
            <span className="mobile-sheet__title">سایر بخش‌ها و امکانات میتی</span>
            <button
              type="button"
              className="mobile-sheet__close"
              onClick={() => setShowMoreSheet(false)}
              aria-label="بستن منو"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mobile-sheet__body">
            {roleItems.length > 0 && (
              <div className="mobile-sheet__section">
                <div className="mobile-sheet__group-label">
                  {user?.role === 'coach' ? 'پنل مربیگری' : user?.role === 'admin' ? 'مدیریت باشگاه' : 'ارتباط با مربی'}
                </div>
                <div className="mobile-sheet__grid">
                  {roleItems.map(({ label, to, icon: Icon, end, desc }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
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
                </div>
              </div>
            )}

            <div className="mobile-sheet__section">
              <div className="mobile-sheet__group-label">سلامتی، هوش مصنوعی و تغذیه</div>
              <div className="mobile-sheet__grid">
                <NavLink
                  to="/ai-hub"
                  className={({ isActive }) => `mobile-sheet__card${isActive ? ' is-active' : ''}`}
                  onClick={() => setShowMoreSheet(false)}
                >
                  <span className="mobile-sheet__card-icon"><Sparkles size={20} /></span>
                  <div className="mobile-sheet__card-info">
                    <strong className="mobile-sheet__card-title">هوش سلامتی</strong>
                    <span className="mobile-sheet__card-desc">پایش آمادگی و ریکاوری</span>
                  </div>
                </NavLink>

                <NavLink
                  to="/nutrition"
                  className={({ isActive }) => `mobile-sheet__card${isActive ? ' is-active' : ''}`}
                  onClick={() => setShowMoreSheet(false)}
                >
                  <span className="mobile-sheet__card-icon"><Utensils size={20} /></span>
                  <div className="mobile-sheet__card-info">
                    <strong className="mobile-sheet__card-title">تغذیه</strong>
                    <span className="mobile-sheet__card-desc">کالری و دفتر خوراک</span>
                  </div>
                </NavLink>
              </div>
            </div>

            <div className="mobile-sheet__section">
              <div className="mobile-sheet__group-label">تنظیمات و برنامه</div>
              <div className="mobile-sheet__grid">
                <NavLink
                  to="/settings"
                  className={({ isActive }) => `mobile-sheet__card${isActive ? ' is-active' : ''}`}
                  onClick={() => setShowMoreSheet(false)}
                >
                  <span className="mobile-sheet__card-icon"><Settings2 size={20} /></span>
                  <div className="mobile-sheet__card-info">
                    <strong className="mobile-sheet__card-title">تنظیمات</strong>
                    <span className="mobile-sheet__card-desc">پروفایل و شخصی‌سازی</span>
                  </div>
                </NavLink>

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
                    <span className="mobile-sheet__card-desc">فایل نصبی و نسخه وب</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
}
