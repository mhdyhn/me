import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, Dumbbell, House, Settings2, Utensils, Zap } from 'lucide-react';
import { useGym } from '../context/GymProvider';

const navigation = [
  { label: 'خانه', to: '/', icon: House, end: true },
  { label: 'برنامه', to: '/program', icon: CalendarDays },
  { label: 'حرکت‌ها', to: '/exercises', icon: Dumbbell },
  { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
  { label: 'تغذیه', to: '/nutrition', icon: Utensils },
];

const titles: Record<string, string> = {
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
  const title = titles[location.pathname] ?? (location.pathname.startsWith('/exercise/') ? 'راهنمای حرکت' : 'تمرین در حال انجام');

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
        <div className="sidebar-footer"><span className="status-dot" /> خصوصی · ذخیره‌شده روی این دستگاه</div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="mobile-brand"><span className="brand-mark"><Dumbbell size={17} /></span> میتی</span>
            <span className="eyebrow topbar-eyebrow">مربی تمرین شخصی</span>
            <h1>{title}</h1>
          </div>
          <div className="topbar-actions">
            {activeSession && location.pathname !== `/workout/${activeSession.templateId}` && (
              <NavLink className="resume-pill" to={`/workout/${activeSession.templateId}`}>
                <span className="resume-dot" /> ادامهٔ تمرین
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
        {[
          { label: 'خانه', to: '/', icon: House, end: true },
          { label: 'برنامه', to: '/program', icon: CalendarDays },
          { label: 'پیشرفت', to: '/progress', icon: BarChart3 },
          { label: 'تغذیه', to: '/nutrition', icon: Utensils },
        ].map(({ label, to, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}>
            <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
