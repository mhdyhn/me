import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, CalendarDays, Dumbbell, House, ListPlus, Settings2, ShieldCheck, Users, Utensils, Zap, type LucideIcon } from 'lucide-react';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import type { Role } from '../lib/api';

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

/** The offline single-file build has no account: it keeps the personal app's navigation. */
const personalNavigation: NavItem[] = [
  { label: 'خانه', to: '/', icon: House, end: true },
  { label: 'برنامه', to: '/program', icon: CalendarDays },
  { label: 'حرکت‌ها', to: '/exercises', icon: Dumbbell },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils },
];

/** Students: their coach's program, progress and nutrition. The full exercise library is not shown. */
const studentNavigation: NavItem[] = [
  { label: 'برنامه من', to: '/', icon: CalendarDays, end: true },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils },
  { label: 'پروفایل', to: '/settings', icon: Settings2 },
];

/** Coaches: students, then building a program for a student. */
const coachNavigation: NavItem[] = [
  { label: 'شاگرد', to: '/coach', icon: Users, end: true },
  { label: 'افزودن برنامه', to: '/coach/programs/new', icon: ListPlus },
];

/** Admin: the coach section of the app. */
const adminNavigation: NavItem[] = [{ label: 'مربی', to: '/coach', icon: ShieldCheck, end: true }];

const navigationFor: Record<Role, NavItem[]> = { student: studentNavigation, coach: coachNavigation, admin: adminNavigation };

const personalTitles: Record<string, string> = {
  '/': 'تمرین امروزت',
  '/program': 'برنامه تمرینی',
  '/exercises': 'راهنمای حرکت‌ها',
  '/progress': 'پیشرفت و سوابق',
  '/nutrition': 'تغذیه',
  '/settings': 'پروفایل و تنظیمات',
};

export function Layout() {
  const location = useLocation();
  const { activeSession, storageWarning } = useGym();
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  const navigation = user ? navigationFor[user.role] : personalNavigation;
  const isPanel = user !== null;

  async function signOutAndLeave() {
    await signOut();
    navigate('/login', { replace: true });
  }

  // Panel screens show their own name inside the page; the top bar only names the personal screens.
  const personalTitle = personalTitles[location.pathname] ?? (location.pathname.startsWith('/exercise/') ? 'راهنمای حرکت' : 'تمرین در حال انجام');
  const hasOwnHeading = location.pathname === '/' || location.pathname.startsWith('/coach');
  const title = isPanel ? (hasOwnHeading ? null : personalTitles[location.pathname] ?? null) : personalTitle;

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
        {!isPanel && (
          <div className="sidebar-coach-note">
            <span className="note-mark"><Zap size={15} fill="currentColor" /></span>
            <p><strong>با هدف تمرین کن.</strong><br />پیشرفت از قدم‌های کوچک می‌آید.</p>
          </div>
        )}
        {!isPanel && (
          <NavLink to="/settings" className={({ isActive }) => `nav-link settings-link${isActive ? ' is-active' : ''}`}>
            <Settings2 size={18} /><span>پروفایل و تنظیمات</span>
          </NavLink>
        )}
        {!isPanel && <div className="sidebar-footer"><span className="status-dot" /> خصوصی · ذخیره‌شده روی این دستگاه</div>}
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="mobile-brand"><span className="brand-mark"><Dumbbell size={17} /></span> میتی</span>
            {!isPanel && <span className="eyebrow topbar-eyebrow">مربی تمرین شخصی</span>}
            {title && <h1>{title}</h1>}
          </div>
          <div className="topbar-actions">
            {!isPanel && activeSession && location.pathname !== `/workout/${activeSession.templateId}` && (
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
            {!isPanel && (
              <NavLink to="/settings" className="profile-button" aria-label="بازکردن پروفایل و تنظیمات">
                <span className="profile-avatar">م</span>
                <span className="profile-button__text">پروفایل من</span>
              </NavLink>
            )}
          </div>
        </header>

        {storageWarning && !isPanel && <div className="storage-warning" role="status">{storageWarning}</div>}
        <main className="page-content" id="main-content"><Outlet /></main>
      </div>

      <nav className="mobile-nav" aria-label="ناوبری موبایل">
        {navigation.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}>
            <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
