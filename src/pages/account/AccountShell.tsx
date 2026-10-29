import { useState, type ReactNode } from 'react';
import { Navigate, Link, useLocation } from 'react-router-dom';
import { Copy, Dumbbell, LogOut } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import type { Credentials, Role } from '../../lib/api';

/** Coaches land on their roster; students and the admin land on their personal training home. */
export function homeFor(role: Role): string {
  return role === 'coach' ? '/coach' : '/';
}

/** A screen inside the app shell (the bottom toolbar stays visible). The shell already shows the page name in the top bar. */
export function PanelPage({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel-page ${className}`.trim()}>
      <h2 className="panel-title">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Keeps a personal-app route for the listed roles only. Signed-out visitors (the offline build)
 * are not affected; a signed-in user of another role is sent to their own home.
 */
export function ForRoles({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useSession();
  if (user && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

/** Full-page shell for sign-in and the coach/student screens. Separate from the personal app's layout. */
export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, signOut } = useSession();
  return (
    <div className="account-shell">
      <header className="account-header">
        <Link to="/" className="brand-lockup account-brand" aria-label="بازگشت به برنامهٔ شخصی">
          <span className="brand-mark"><Dumbbell size={18} strokeWidth={2.3} /></span>
          <strong>میتی</strong>
        </Link>
        {user && (
          <div className="account-user">
            <span>{user.displayName}</span>
            <button type="button" className="button button--ghost" onClick={() => void signOut()}>
              <LogOut size={16} /> خروج
            </button>
          </div>
        )}
      </header>
      <main className="account-main">
        <h1 className="account-title">{title}</h1>
        {children}
      </main>
    </div>
  );
}

/** The whole app sits behind sign-in: nothing is shown until a session exists. */
export function RequireSignIn({ children }: { children: ReactNode }) {
  const { status, user, signOut } = useSession();
  const location = useLocation();
  if (status === 'loading') return <p className="account-muted account-loading">در حال بارگذاری…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.isActive === false) {
    return (
      <div className="account-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh', padding: 20 }}>
        <div className="panel-card" style={{ maxWidth: 420, textAlign: 'center', padding: 24, border: '1px solid #f87171' }} role="alert">
          <h2 style={{ color: '#f87171', fontSize: 18, marginBottom: 12 }}>حساب کاربری شما غیرفعال شده است</h2>
          <p className="account-muted" style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
            دسترسی شما به این حساب توسط مربی یا مدیریت باشگاه غیرفعال شده است. لطفاً برای بررسی وضعیت و فعال‌سازی مجدد با مربی یا پشتیبانی باشگاه تماس بگیرید.
          </p>
          <button type="button" className="button button--ghost" onClick={() => void signOut()} style={{ margin: '0 auto' }}>
            <LogOut size={16} /> خروج از حساب
          </button>
        </div>
      </div>
    );
  }
  if (user.mustChangePassword) return <Navigate to="/account/change-password" replace />;
  return <>{children}</>;
}

/** Requires one of the roles. Students with a temporary password go to the change-password screen first. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user, signOut } = useSession();
  if (status === 'loading') return <p className="account-muted">در حال بارگذاری…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isActive === false) {
    return (
      <div className="account-shell" style={{ display: 'grid', placeItems: 'center', minHeight: '80vh', padding: 20 }}>
        <div className="panel-card" style={{ maxWidth: 420, textAlign: 'center', padding: 24, border: '1px solid #f87171' }} role="alert">
          <h2 style={{ color: '#f87171', fontSize: 18, marginBottom: 12 }}>حساب کاربری شما غیرفعال شده است</h2>
          <p className="account-muted" style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
            دسترسی شما به این حساب توسط مربی یا مدیریت باشگاه غیرفعال شده است. لطفاً برای بررسی وضعیت و فعال‌سازی مجدد با مربی یا پشتیبانی باشگاه تماس بگیرید.
          </p>
          <button type="button" className="button button--ghost" onClick={() => void signOut()} style={{ margin: '0 auto' }}>
            <LogOut size={16} /> خروج از حساب
          </button>
        </div>
      </div>
    );
  }
  if (user.mustChangePassword) return <Navigate to="/account/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

/** Shows a new username and password exactly once. The password cannot be read again later. */
export function CredentialsCard({ credentials, onDone, action }: { credentials: Credentials; onDone: () => void; action?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = `نام کاربری: ${credentials.username}\nرمز عبور: ${credentials.password}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="credentials-card" aria-live="polite">
      <p className="credentials-warning">
        این مشخصات فقط همین یک بار نمایش داده می‌شود. آن را برای <strong>{credentials.user.displayName}</strong> بفرستید.
      </p>
      <dl className="credentials-list">
        <div><dt>نام کاربری</dt><dd dir="ltr">{credentials.username}</dd></div>
        <div><dt>رمز عبور</dt><dd dir="ltr">{credentials.password}</dd></div>
      </dl>
      <div className="credentials-actions">
        <button type="button" className="button button--ghost" onClick={() => void copy()}>
          <Copy size={16} /> {copied ? 'کپی شد' : 'کپی'}
        </button>
        {action}
        <button type="button" className="button button--ghost" onClick={onDone}>
          متوجه شدم
        </button>
      </div>
    </section>
  );
}
