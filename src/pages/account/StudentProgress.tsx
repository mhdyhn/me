import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, HeartPulse, Search, Sparkles } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { exerciseById } from '../../data/exercises';
import { faNumber, formatDate } from '../../lib/format';
import { calculateMuscleRecovery, calculateReadinessScore, DEFAULT_HEALTH_METRICS } from '../../lib/aiHealthEngine';
import { runStudentDiagnostic } from '../../lib/studentDiagnostic';
import type { WorkoutSession } from '../../types';
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
    <RequireRole roles={['coach', 'admin']}>
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

  const mappedSessions: WorkoutSession[] = (data?.sessions ?? []).map((s) => ({
    id: s.id,
    templateId: '',
    name: s.name,
    startedAt: s.startedAt,
    completedAt: s.completedAt ?? undefined,
    status: s.status,
    notes: s.notes,
    currentExerciseIndex: 0,
    currentSetIndex: 0,
    exercises: s.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.map((st) => ({
        setNumber: st.setNumber,
        weightKg: st.weightKg,
        reps: st.reps,
        rir: st.rir,
        notes: st.notes,
        doneAt: st.doneAt,
      })),
    })),
  }));

  const studentReadiness = calculateReadinessScore(DEFAULT_HEALTH_METRICS, mappedSessions);
  const studentMuscles = calculateMuscleRecovery(mappedSessions);
  const diagnostic = runStudentDiagnostic(data?.sessions ?? []);

  return (
    <PanelPage title={data ? `پیشرفت ${data.studentName}` : 'پیشرفت شاگرد'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Link className="chat-back" to="/coach" style={{ margin: 0 }}><ArrowLeft size={16} /> همهٔ شاگردها</Link>
        <Link to={`/coach/students/${studentId}/ai`} className="button button--ghost button--small">
          <Sparkles size={15} /> تنظیمات هوش و بیومتریک
        </Link>
      </div>

      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!data && !loadError && <p className="account-muted">در حال بارگذاری…</p>}
      {data && data.sessions.length === 0 && <p className="account-muted">هنوز جلسه‌ای ثبت نشده است.</p>}

      {data && data.sessions.length > 0 && (
        <>
          {/* Coach AI Co-Pilot Summary Card */}
          <section className="coach-ai-panel">
            <div className="coach-ai-header">
              <div className="flex items-center gap-2">
                <span className="badge badge--success" style={{ borderColor: `${studentReadiness.color}40`, color: studentReadiness.color }}>
                  <Sparkles size={14} /> دستیار هوش مصنوعی مربی (Co-Pilot)
                </span>
                <span className="muted text-xs">تحلیل Whoop & Fitbod</span>
              </div>
              <span className="text-xs" style={{ color: studentReadiness.color, fontWeight: 700 }}>
                {studentReadiness.levelLabel.split('(')[0]} ({faNumber(studentReadiness.score)}٪)
              </span>
            </div>

            <div className="coach-ai-body">
              <div className="coach-ai-readiness">
                <HeartPulse size={20} style={{ color: studentReadiness.color }} />
                <div>
                  <strong>{studentReadiness.recoveryTitle}</strong>
                  <p className="text-xs muted" style={{ margin: '2px 0 0' }}>
                    {studentReadiness.coachRecommendation}
                  </p>
                </div>
              </div>

              <div className="coach-ai-muscles">
                <span className="text-xs muted block" style={{ marginBottom: 6 }}>
                  وضعیت ترمیم عضلات شاگرد (تخمین هوشمند):
                </span>
                <div className="coach-muscles-chips">
                  {studentMuscles.map((m) => (
                    <span key={m.zoneKey} className="badge badge--neutral text-xs" title={m.statusLabel}>
                      <span
                        style={{
                          backgroundColor: m.color,
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          display: 'inline-block',
                          marginInlineEnd: 4,
                        }}
                      />
                      {m.label}: {faNumber(m.recoveryPercent)}٪
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Diagnostic Snapshot */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Search size={16} className="icon-accent" />
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>عیب‌یابی روند پیشرفت: </span>
                  <span className="badge text-xs" style={{ backgroundColor: `${diagnostic.statusColor}20`, color: diagnostic.statusColor }}>
                    {diagnostic.statusLabel}
                  </span>
                </div>
              </div>
              <Link to={`/coach/students/${studentId}/ai`} className="text-link text-xs">
                دیدن گزارش عیب‌یابی کامل و پایش بیومتریک <ArrowLeft size={13} />
              </Link>
            </div>
          </section>

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
        </>
      )}
    </PanelPage>
  );
}

function durationMinutes(startedAt: string, completedAt: string): number {
  const minutes = Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 60000);
  return Math.max(0, minutes);
}
