import { useState, type ReactNode } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

interface PersonCardProps {
  name: string;
  username: string;
  /** The generated password when it is still the one in use; null once the person has chosen their own. */
  password: string | null;
  mustChangePassword: boolean;
  /** Short role label shown under the name, e.g. «مربی» or «شاگرد». */
  roleLabel: string;
  /** Extra badges on the header, e.g. the student count. */
  badges?: ReactNode;
  /** Buttons along the bottom of the card. */
  actions: ReactNode;
}

/** One person's card: identity, sign-in details with copy buttons, and actions. Used for coaches (admin) and students (coach). */
export function PersonCard({ name, username, password, mustChangePassword, roleLabel, badges, actions }: PersonCardProps) {
  return (
    <article className="person-card">
      <header className="person-card__head">
        <span className="person-card__avatar" aria-hidden="true">{name.trim().charAt(0) || '؟'}</span>
        <div className="person-card__identity">
          <strong>{name}</strong>
          <span className="person-card__role">{roleLabel}</span>
        </div>
        {(badges || mustChangePassword) && (
          <div className="person-card__badges">
            {badges}
            {mustChangePassword && <span className="badge">رمز موقت</span>}
          </div>
        )}
      </header>

      <dl className="person-card__credentials">
        <CredentialRow label="نام کاربری" value={username} />
        {password ? (
          <CredentialRow label="رمز عبور" value={password} secret />
        ) : (
          <div className="person-card__row">
            <dt>رمز عبور</dt>
            <dd className="person-card__note">
              {mustChangePassword ? 'رمز ذخیره نشده. با «رمز تازه» یک رمز جدید بسازید.' : 'خودش رمزش را انتخاب کرده است.'}
            </dd>
          </div>
        )}
      </dl>

      <footer className="person-card__actions">{actions}</footer>
    </article>
  );
}

function CredentialRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="person-card__row">
      <dt>{label}</dt>
      <dd>
        <span className="person-card__value" dir="ltr">{visible ? value : '•'.repeat(Math.min(value.length, 10))}</span>
        {secret && (
          <button type="button" className="icon-button" onClick={() => setVisible((current) => !current)} aria-label={visible ? `پنهان کردن ${label}` : `نمایش ${label}`}>
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
        <button type="button" className="icon-button" onClick={() => void copy()} aria-label={`کپی ${label}`}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </dd>
    </div>
  );
}
