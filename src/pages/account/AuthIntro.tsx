import { Activity, Dumbbell, ShieldCheck, UsersRound } from 'lucide-react';

/** A compact, responsive introduction shared by sign-in and registration. */
export function AuthIntro() {
  return (
    <aside className="auth-intro" aria-label="معرفی میتی">
      <div className="auth-intro__brand"><span className="brand-mark"><Dumbbell size={20} /></span><span>میتی <small>همراه تمرین</small></span></div>
      <div className="auth-intro__copy">
        <span className="auth-intro__eyebrow">برای حرکت رو به جلو</span>
        <h2>هر تمرین،<br />یک قدم برای خودت.</h2>
        <p>از برنامه تا پیشرفت؛ جایی ساده برای تمرین شخصی و همراهی مربی و شاگرد.</p>
      </div>
      <div className="auth-intro__art" aria-hidden="true">
        <div className="auth-intro__orbit auth-intro__orbit--one" />
        <div className="auth-intro__orbit auth-intro__orbit--two" />
        <span className="auth-intro__dumbbell"><Dumbbell size={46} strokeWidth={1.5} /></span>
        <span className="auth-intro__art-label">قدم به قدم</span>
      </div>
      <div className="auth-intro__points">
        <span><Activity size={16} /> تمرین و پیگیری در یک جا</span>
        <span><UsersRound size={16} /> مناسب مربی و شاگرد</span>
        <span><ShieldCheck size={16} /> حساب شخصی برای هر نفر</span>
      </div>
    </aside>
  );
}
