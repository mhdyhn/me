import { useState, type ReactNode } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Copy, Dumbbell, LogOut } from 'lucide-react';
import { useSession } from '../../context/SessionContext';
import type { Credentials, Role } from '../../lib/api';

/** Where each role lands after signing in. */
export function homeFor(role: Role): string {
  return role === 'student' ? '/my-program' : '/coach';
}

/** Full-page shell for sign-in and the coach/student screens. Separate from the personal app's layout. */
export function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  const { user, signOut } = useSession();
  return (
    <div className="account-shell">
      <header className="account-header">
        <Link to="/login" className="brand-lockup account-brand" aria-label="میتی">
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

/** Keeps a route for specific roles. Students with a temporary password go to the change-password screen first. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, user } = useSession();
  if (status === 'loading') return <p className="account-muted">در حال بارگذاری…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/account/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

/** Shows a new username and password exactly once. The password cannot be read again later. */
export function CredentialsCard({ credentials, onDone }: { credentials: Credentials; onDone: () => void }) {
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
        <button type="button" className="button button--primary" onClick={onDone}>
          متوجه شدم
        </button>
      </div>
    </section>
  );
}
