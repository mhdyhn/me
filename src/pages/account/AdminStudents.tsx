import { useEffect, useState, type FormEvent } from 'react';
import { Ban, CheckCircle, KeyRound, Search } from 'lucide-react';
import { confirmModal } from '../../components/ConfirmModal';
import { ApiError, api, type Credentials, type PublicUser } from '../../lib/api';
import { CredentialsCard } from './AccountShell';
import { PersonCard } from './PersonCard';

interface AdminStudent extends PublicUser { coachName: string | null; password: string | null }

/** One admin directory for manually created and self-registered students alike. */
export function AdminStudents() {
  const [students, setStudents] = useState<AdminStudent[] | null>(null);
  const [username, setUsername] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);

  async function load(search = '', cursor: number | null = null) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('username', search.trim());
      if (cursor !== null) params.set('before', String(cursor));
      const query = params.size ? `?${params}` : '';
      const result = await api<{ students: AdminStudent[]; nextCursor: number | null }>('GET', `/admin/students${query}`);
      setStudents((current) => cursor === null ? result.students : [...(current ?? []), ...result.students]);
      setNextCursor(result.nextCursor ?? null);
      setActiveSearch(search.trim());
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'فهرست شاگردها بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load(username);
  }

  async function reset(student: PublicUser) {
    const ok = await confirmModal({
      title: 'بازیابی دستی رمز',
      message: `فقط پس از بررسی هویت «${student.displayName}» رمز تازه بساز. با رمز قبلی و نشست‌های قبلی دیگر نمی‌توان وارد شد.`,
      confirmText: 'ساخت رمز تازه', cancelText: 'انصراف', variant: 'warning',
    });
    if (!ok) return;
    try {
      const result = await api<{ username: string; password: string }>('POST', `/students/${student.id}/reset-password`, {});
      setCredentials({ user: student, ...result });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'ساخت رمز تازه انجام نشد.');
    }
  }

  async function changeActive(student: PublicUser) {
    const active = student.isActive === false;
    const ok = await confirmModal({
      title: active ? 'فعال‌سازی حساب' : 'غیرفعال‌سازی حساب',
      message: active ? `حساب «${student.displayName}» دوباره فعال شود؟` : `حساب «${student.displayName}» غیرفعال و نشست‌های آن بسته شود؟`,
      confirmText: active ? 'فعال‌سازی' : 'غیرفعال‌سازی', cancelText: 'انصراف', variant: active ? 'primary' : 'danger',
    });
    if (!ok) return;
    try {
      await api('PUT', `/students/${student.id}/active`, { active });
      await load(username);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'تغییر وضعیت حساب انجام نشد.');
    }
  }

  return (
    <section className="independent-accounts panel-card" aria-labelledby="admin-students-heading">
      <div className="admin-students-heading"><div><span className="eyebrow">مدیریت حساب‌ها</span><h3 id="admin-students-heading">همهٔ شاگردها</h3></div><span>ساخته‌شده دستی و ثبت‌نام مستقیم</span></div>
      <p className="account-muted">حساب‌ها از جدیدترین نمایش داده می‌شوند؛ می‌توانی بقیه را ببینی یا نام کاربری دقیق را جست‌وجو کنی. پیش از بازیابی رمز، هویت صاحب حساب را خارج از برنامه بررسی کن.</p>
      {credentials && <CredentialsCard credentials={credentials} onDone={() => setCredentials(null)} />}
      <form className="independent-accounts__search" onSubmit={(event) => void search(event)}>
        <label className="field"><span>نام کاربری دقیق</span><input dir="ltr" value={username} onChange={(event) => setUsername(event.target.value)} maxLength={64} /></label>
        <button type="submit" className="button button--secondary" disabled={loading}><Search size={16} /> جست‌وجو</button>
        <button type="button" className="button button--ghost" disabled={loading} onClick={() => { setUsername(''); void load(); }}>همهٔ شاگردها</button>
      </form>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading && <p className="account-muted" role="status">در حال بارگذاری…</p>}
      {!loading && students?.length === 0 && <p className="account-muted">حسابی پیدا نشد.</p>}
      {students && students.length > 0 && <ul className="person-card-grid">
        {students.map((student) => <li key={student.id}>
          <PersonCard name={student.displayName} username={student.username} phoneNumber={student.phoneNumber} password={student.password} mustChangePassword={student.mustChangePassword} roleLabel={student.coachName ? `مربی: ${student.coachName}${student.coachAccess === false ? ' · دسترسی قطع است' : ''}` : 'بدون مربی'} isActive={student.isActive !== false} badges={<span className="badge">{student.selfRegistered ? 'ثبت‌نام مستقیم' : 'ساخته‌شده دستی'}</span>} actions={<>
            <button type="button" className="button button--ghost" onClick={() => void reset(student)}><KeyRound size={16} /> رمز تازه</button>
            <button type="button" className="button button--ghost" onClick={() => void changeActive(student)}>
              {student.isActive === false ? <><CheckCircle size={16} /> فعال‌سازی</> : <><Ban size={16} /> غیرفعال‌سازی</>}
            </button>
          </>} />
        </li>)}
      </ul>}
      {nextCursor !== null && <button type="button" className="button button--secondary button--small" disabled={loading} onClick={() => void load(activeSearch, nextCursor)}>نمایش شاگردهای بیشتر</button>}
    </section>
  );
}
