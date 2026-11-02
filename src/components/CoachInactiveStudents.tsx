import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, RefreshCw, Sparkles, TrendingUp, UserX } from 'lucide-react';
import { CollapsiblePanel } from './CollapsiblePanel';
import { ApiError, api } from '../lib/api';
import { faNumber, formatDate } from '../lib/format';

interface InsightView {
  text: string;
  source: 'ai' | 'rules';
}

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
  const [insight, setInsight] = useState<InsightView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<{ students: InactiveStudentView[]; inactiveDays?: number; insight?: InsightView }>('GET', '/coach/inactive-students');
      setStudents(result.students ?? []);
      if (typeof result.inactiveDays === 'number') setInactiveDays(result.inactiveDays);
      setInsight(result.insight ?? null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'گزارش بی‌تمرینی بارگذاری نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The report is fetched the first time the section is opened, not when the panel loads.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!opened) return;
    void load();
  }, [opened, load]);

  if (error) {
    return (
      <CollapsiblePanel
        title="شاگردان بی‌تمرین"
        subtitle="گزارش بررسی‌نشده"
        icon={<UserX size={18} />}
        headingId="coach-inactive-heading"
        defaultOpen
        onToggle={(next) => { if (next) setOpened(true); }}
      >
        <p className="form-error" role="alert">{error}</p>
        <button type="button" className="button button--ghost button--small" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={15} /> تلاش دوباره
        </button>
      </CollapsiblePanel>
    );
  }

  if (students === null) {
    return (
      <CollapsiblePanel
        title="شاگردان بی‌تمرین"
        subtitle="در حال بررسیِ تمرینِ شاگردها…"
        icon={<UserX size={18} />}
        headingId="coach-inactive-heading"
        onToggle={(next) => { if (next) setOpened(true); }}
      >
        <p className="account-muted" role="status">در حال بررسیِ تمرینِ شاگردها…</p>
      </CollapsiblePanel>
    );
  }

  return (
    <CollapsiblePanel
      title="شاگردان بی‌تمرین"
      subtitle={
        students.length === 0
          ? `هیچ شاگردی در ${faNumber(inactiveDays)} روز اخیر بی‌تمرین نبوده است.`
          : `${faNumber(students.length)} شاگرد در ${faNumber(inactiveDays)} روز اخیر تمرینی ثبت نکرده‌اند.`
      }
      icon={<UserX size={18} />}
      headingId="coach-inactive-heading"
      badge={students.length > 0 ? faNumber(students.length) : undefined}
      onToggle={(next) => { if (next) setOpened(true); }}
    >
      <div className="coach-inactive__head">
        <button type="button" className="button button--ghost button--small" disabled={loading} onClick={() => void load()}>
          <RefreshCw size={15} /> تازه‌سازی
        </button>
      </div>
      {insight && students.length > 0 && (
        <p className="coach-inactive__insight">
          <Sparkles size={15} /> {insight.text}
        </p>
      )}
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
    </CollapsiblePanel>
  );
}
