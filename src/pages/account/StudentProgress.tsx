import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { exerciseById } from '../../data/exercises';
import { faNumber, formatDate } from '../../lib/format';
import { RequireRole, PanelPage } from './AccountShell';

interface SummarySet {
  setNumber: number;
  weightKg: number;
  reps: number;
  rir: number;
  notes: string;
  doneAt: string;
}

interface SummaryExercise {
  exerciseId: string;
  sets: SummarySet[];
}

interface SummarySession {
  id: string;
  name: string;
  startedAt: string;
  completedAt: string | null;
  status: 'active' | 'completed' | 'abandoned';
  notes: string;
  exercises: SummaryExercise[];
}

interface ProgressResponse {
  studentName: string;
  sessions: SummarySession[];
}

const STATUS_LABEL: Record<SummarySession['status'], string> = {
  completed: 'کامل شد',
  abandoned: 'نیمه‌کاره رها شد',
  active: 'هنوز تمام نشده',
};

/** A coach's view of one student's workouts: date, exercises, sets, weight and reps, and whether each session was finished. */
export function StudentProgress() {
  return (
    <RequireRole roles={['coach']}>
      <StudentProgressScreen />
    </RequireRole>
  );
}

function StudentProgressScreen() {
  const { studentId } = useParams();
  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api<ProgressResponse>('GET', `/students/${studentId}/sessions`);
        if (!cancelled) setData(result);
      } catch (caught) {
        if (!cancelled) setLoadError(caught instanceof ApiError ? caught.message : 'پیشرفت شاگرد بارگذاری نشد.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <PanelPage title={data ? `پیشرفت ${data.studentName}` : 'پیشرفت شاگرد'}>
      <Link className="chat-back" to="/coach"><ArrowLeft size={16} /> همهٔ شاگردها</Link>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {data && data.sessions.length === 0 && <p className="account-muted">هنوز جلسه‌ای ثبت نشده است.</p>}

      {data && data.sessions.length > 0 && (
        <ol className="progress-sessions" aria-label="جلسه‌های تمرین">
          {data.sessions.map((session) => (
            <li key={session.id} className="progress-session">
              <div className="progress-session__head">
                <div>
                  <strong>{session.name || 'جلسهٔ تمرین'}</strong>
                  <span className="account-muted"> · {formatDate(session.startedAt, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
                <span className={`progress-status progress-status--${session.status}`}>{STATUS_LABEL[session.status]}</span>
              </div>
              {session.completedAt && (
                <p className="account-muted">مدت: {faNumber(durationMinutes(session.startedAt, session.completedAt))} دقیقه</p>
              )}
              {session.notes && <p className="progress-note">{session.notes}</p>}

              {session.exercises.map((exercise, index) => (
                <div key={`${exercise.exerciseId}-${index}`} className="progress-exercise">
                  <h4>{exerciseById(exercise.exerciseId)?.name ?? exercise.exerciseId}</h4>
                  {exercise.sets.length === 0 ? (
                    <p className="account-muted">هنوز ستی ثبت نشده است.</p>
                  ) : (
                    <ul className="progress-sets">
                      {exercise.sets.map((set) => (
                        <li key={set.setNumber}>
                          ست {faNumber(set.setNumber)}: <strong>{faNumber(set.weightKg)} کیلوگرم × {faNumber(set.reps)} تکرار</strong>
                          <span className="account-muted"> · تکرار در ذخیره {faNumber(set.rir)}</span>
                          {set.notes && <span className="account-muted"> · {set.notes}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </PanelPage>
  );
}

function durationMinutes(startedAt: string, completedAt: string): number {
  const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return Math.max(0, minutes);
}
