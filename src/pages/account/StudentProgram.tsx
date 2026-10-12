import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, api, type Programme } from '../../lib/api';
import { PanelPage, RequireRole } from './AccountShell';

/** Persian digits without padding, so 3 shows as ۳ rather than ۰۳. */
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const faDigits = (value: number | string) => String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);

export function StudentProgram() {
  return (
    <RequireRole roles={['student']}>
      <Programme />
    </RequireRole>
  );
}

function Programme() {
  const [state, setState] = useState<{ program: Programme | null; coachName: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ program: Programme | null; coachName: string | null }>('GET', '/me/program')
      .then(setState)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'برنامه بارگذاری نشد.'));
  }, []);

  if (error) return <PanelPage title="برنامهٔ من"><p className="form-error" role="alert">{error}</p></PanelPage>;
  if (!state) return <PanelPage title="برنامهٔ من"><p className="account-muted">در حال بارگذاری…</p></PanelPage>;
  if (!state.program) {
    return (
      <PanelPage title="برنامهٔ من">
        <p className="account-muted">هنوز برنامه‌ای از مربی برای شما ثبت نشده است.</p>
      </PanelPage>
    );
  }

  const { program, coachName } = state;
  return (
    <PanelPage title={program.title}>
      <p className="account-muted">
        {coachName ? `تنظیم‌شده توسط ${coachName}` : 'تنظیم‌شده توسط مربی'} · آخرین به‌روزرسانی {new Date(program.updatedAt).toLocaleDateString('fa-IR')}
      </p>
      {program.days.map((day, dayIndex) => (
        <section key={dayIndex} className="student-day">
          <h2>{day.name}</h2>
          <ul className="student-exercises">
            {day.exercises.map((item, itemIndex) => (
              <li key={`${item.exerciseId}-${itemIndex}`}>
                <strong>{item.name}</strong>
                <span className="account-muted">{item.muscle}</span>
                <span className="student-exercises__prescription">
                  {faDigits(item.sets)} ست × <span dir="ltr">{faDigits(item.reps)}</span> تکرار · استراحت <span dir="ltr">{faDigits(item.restSeconds)}</span> ثانیه
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PanelPage>
  );
}

/** The movements in the coach's program, for the student's "حرکت‌ها" section. The full library is not shown to students. */
export function StudentMovements() {
  return (
    <RequireRole roles={['student']}>
      <Movements />
    </RequireRole>
  );
}

function Movements() {
  const [state, setState] = useState<{ program: Programme | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ program: Programme | null }>('GET', '/me/program')
      .then(setState)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'حرکت‌ها بارگذاری نشد.'));
  }, []);

  if (error) return <PanelPage title="حرکت‌های برنامه"><p className="form-error" role="alert">{error}</p></PanelPage>;
  if (!state) return <PanelPage title="حرکت‌های برنامه"><p className="account-muted">در حال بارگذاری…</p></PanelPage>;

  const movements = new Map<string, { id: string; name: string; muscle: string }>();
  for (const day of state.program?.days ?? []) {
    for (const item of day.exercises) {
      if (!movements.has(item.exerciseId)) movements.set(item.exerciseId, { id: item.exerciseId, name: item.name, muscle: item.muscle });
    }
  }

  return (
    <PanelPage title="حرکت‌های برنامه">
      {movements.size === 0 && <p className="account-muted">هنوز حرکتی در برنامهٔ شما نیست.</p>}
      <ul className="student-exercises">
        {[...movements.values()].map((movement) => (
          <li key={movement.id}>
            <Link to={`/exercise/${movement.id}`}><strong>{movement.name}</strong></Link>
            <span className="account-muted">{movement.muscle}</span>
          </li>
        ))}
      </ul>
    </PanelPage>
  );
}

/** Opens a movement's guide only when it is part of the student's own program. */
export function AssignedMovementGate({ children }: { children: ReactNode }) {
  const { exerciseId = '' } = useParams();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    api<{ program: Programme | null }>('GET', '/me/program')
      .then((state) => setAllowed(Boolean(state.program?.days.some((day) => day.exercises.some((item) => item.exerciseId === exerciseId)))))
      .catch(() => setAllowed(false));
  }, [exerciseId]);

  if (allowed === null) return <p className="account-muted">در حال بارگذاری…</p>;
  if (!allowed) return <Navigate to="/exercises" replace />;
  return <>{children}</>;
}
