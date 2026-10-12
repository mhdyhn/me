import type { CSSProperties } from 'react';
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

/** The whole personal app: every signed-in user has it. The offline single-file build has only this. */
const personalNavigation: NavItem[] = [
  { label: 'خانه', to: '/', icon: House, end: true },
  { label: 'برنامه', to: '/program', icon: CalendarDays },
  { label: 'حرکت‌ها', to: '/exercises', icon: Dumbbell },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils },
];

/** Extra sections added to the same toolbar for each role. Students get none: their program comes from the coach. */
const roleNavigation: Record<Role, NavItem[]> = {
  student: [],
  coach: [
    { label: 'شاگرد', to: '/coach', icon: Users, end: true },
    { label: 'افزودن برنامه', to: '/coach/programs/new', icon: ListPlus },
  ],
  admin: [{ label: 'مربی', to: '/coach', icon: ShieldCheck, end: true }],
};

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
  const navigation = user ? [...personalNavigation, ...roleNavigation[user.role]] : personalNavigation;
  // Screens that bring their own heading (coach screens, a student's coach program and movements).
  const ownHeading = location.pathname.startsWith('/coach') || (user?.role === 'student' && (location.pathname === '/program' || location.pathname === '/exercises'));

  async function signOutAndLeave() {
    await signOut();
    navigate('/login', { replace: true });
  }

  const title = ownHeading ? null : personalTitles[location.pathname] ?? (location.pathname.startsWith('/exercise/') ? 'راهنمای حرکت' : 'تمرین در حال انجام');

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
            <p><strong>با هدف تمرین کن.</strong><br />پیشرفت از قدم‌های کوچک می‌آید.</p>
        </div>
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

      <nav className="mobile-nav" aria-label="ناوبری موبایل" style={{ '--nav-count': navigation.length } as CSSProperties}>
        {navigation.map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}>
            <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
