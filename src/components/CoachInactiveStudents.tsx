import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, RefreshCw, TrendingUp, UserX } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { faNumber, formatDate } from '../lib/format';

interface InactiveStudentView {
  id: number;
  displayName: string;
  username: string;
  lastSessionAt: string | null;
  daysSinceLastSession: number | null;
  sessionsLast30Days: number;
  hasProgramme: boolean;
}

/**
 * The coach's "students who stopped training" report.
 *
 * The student list shows everyone; this report shows who needs a nudge, how long the
 * silence lasted, and whether the programme is still waiting for them.
 */
export function CoachInactiveStudents() {
  const [students, setStudents] = useState<InactiveStudentView[] | null>(null);
  const [inactiveDays, setInactiveDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ students: InactiveStudentView[]; inactiveDays?: number }>('GET', '/coach/inactive-students');
      setStudents(result.students ?? []);
      if (typeof result.inactiveDays === 'number') setInactiveDays(result.inactiveDays);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'گزارش بی‌تمرینی بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <section className="coach-inactive" aria-label="شاگردان بی‌تمرین">
        <p className="form-error" role="alert">{error}</p>
        <button type="button" className="button button--ghost button--small" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={15} /> تلاش دوباره
        </button>
      </section>
    );
  }

  if (students === null) {
    return (
      <section className="coach-inactive" aria-label="شاگردان بی‌تمرین">
        <p className="account-muted" role="status">در حال بررسیِ تمرینِ شاگردها…</p>
      </section>
    );
  }

  return (
    <section className="coach-inactive" aria-label="شاگردان بی‌تمرین">
      <header className="coach-inactive__head">
        <div>
          <h3 className="coach-inactive__title"><UserX size={17} /> شاگردان بی‌تمرین</h3>
          <p className="coach-inactive__hint">
            {students.length === 0
              ? `هیچ شاگردی در ${faNumber(inactiveDays)} روز اخیر بی‌تمرین نبوده است.`
              : `${faNumber(students.length)} شاگرد در ${faNumber(inactiveDays)} روز اخیر تمرینی ثبت نکرده‌اند.`}
          </p>
        </div>
        <button type="button" className="button button--ghost button--small" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={15} /> تازه‌سازی
        </button>
      </header>
      {students.length > 0 && (
        <ul className="coach-inactive__list">
          {students.map((student) => (
            <li key={student.id} className="coach-inactive__item">
              <div className="coach-inactive__identity">
                <strong>{student.displayName}</strong>
                <span className="coach-inactive__meta">
                  {student.daysSinceLastSession === null
                    ? 'هنوز هیچ تمرینی ثبت نشده'
                    : `${faNumber(student.daysSinceLastSession)} روز از آخرین تمرین گذشته`}
                  {student.lastSessionAt && ` — آخرین جلسه: ${formatDate(student.lastSessionAt)}`}
                </span>
                <span className="coach-inactive__meta">
                  {faNumber(student.sessionsLast30Days)} جلسه در ۳۰ روز اخیر
                  {student.hasProgramme ? ' — برنامهٔ شما هنوز برای او فعال است' : ' — برنامه‌ای برای او ثبت نشده'}
                </span>
              </div>
              <div className="coach-inactive__actions">
                <Link className="button button--ghost button--small" to={`/coach/students/${student.id}/progress`}>
                  <TrendingUp size={15} /> پیشرفت
                </Link>
                <Link className="button button--ghost button--small" to={`/coach/students/${student.id}/chat`}>
                  <MessageCircle size={15} /> گفتگو
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
