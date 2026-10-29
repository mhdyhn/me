import { useEffect, useRef, useState } from 'react';
import { ApiError, api, type Programme } from '../lib/api';
import { faNumber } from '../lib/format';

type ArchivePage = { programs: Programme[]; nextCursor: string | null };

/** Previous purchased or free programmes remain readable even after the coach assigns a new one. */
export function ProgrammeArchive({ studentId }: { studentId: number }) {
  const [programs, setPrograms] = useState<Programme[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    const request = ++generation.current;
    setPrograms([]);
    setCursor(null);
    setError(null);
    setLoading(false);
    api<ArchivePage>('GET', '/me/programs/archive')
      .then((result) => {
        if (request !== generation.current) return;
        setPrograms(Array.isArray(result.programs) ? result.programs : []);
        setCursor(result.nextCursor ?? null);
      })
      .catch((caught) => {
        if (request === generation.current) setError(caught instanceof ApiError ? caught.message : 'بایگانی برنامه‌ها بارگذاری نشد.');
      });
    return () => { generation.current += 1; };
  }, [studentId]);

  // Temporary test access never becomes a permanent purchase in the archive.
  useEffect(() => {
    const deadlines = programs.filter((program) => program.isTestPurchase && program.testPurchaseExpiresAt)
      .map((program) => Date.parse(program.testPurchaseExpiresAt!)).filter(Number.isFinite);
    if (!deadlines.length) return;
    const delay = Math.max(0, Math.min(...deadlines) - Date.now());
    const timer = window.setTimeout(() => {
      setPrograms((current) => current.filter((program) => !program.isTestPurchase || !program.testPurchaseExpiresAt || Date.parse(program.testPurchaseExpiresAt) > Date.now()));
    }, Math.min(delay + 250, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [programs]);

  async function loadMore() {
    if (!cursor || loading) return;
    const request = generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<ArchivePage>('GET', `/me/programs/archive?cursor=${encodeURIComponent(cursor)}`);
      if (request !== generation.current) return;
      setPrograms((current) => [...current, ...(Array.isArray(result.programs) ? result.programs : [])]);
      setCursor(result.nextCursor ?? null);
    } catch (caught) {
      if (request === generation.current) setError(caught instanceof ApiError ? caught.message : 'ادامهٔ بایگانی بارگذاری نشد.');
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  if (!programs.length) return error ? <p className="account-muted" role="status">بایگانی برنامه‌ها در دسترس نیست: {error}</p> : null;

  return (
    <details className="panel-card programme-archive">
      <summary>بایگانی برنامه‌های قبلی</summary>
      <p className="account-muted">برنامه‌های خریداری‌شده و رایگان قبلی برای مشاهده محفوظ‌اند؛ تمرین از برنامهٔ فعلی شروع می‌شود. دسترسی آزمایشی خرید واقعی نیست و با پایان یا لغو آزمایش تمام می‌شود.</p>
      {programs.map((program) => (
        <details key={program.id} className="programme-archive__item">
          <summary>{program.title}{program.isTestPurchase && ' · دسترسی آزمایشی موقت'}</summary>
          {program.isTestPurchase && program.testPurchaseExpiresAt && <p className="account-muted">حداکثر اعتبار: {new Date(program.testPurchaseExpiresAt).toLocaleString('fa-IR')}</p>}
          {program.days.map((day, dayIndex) => (
            <section key={`${program.id}-${dayIndex}`}>
              <h3>{day.name}</h3>
              <ul>
                {day.exercises.map((exercise, index) => (
                  <li key={`${exercise.exerciseId}-${index}`}>
                    {exercise.name} · {faNumber(exercise.sets)} ست · {exercise.reps} تکرار · {faNumber(exercise.restSeconds)} ثانیه استراحت
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      ))}
      {error && <p className="form-error" role="status">{error}</p>}
      {cursor && <button type="button" className="button button--secondary button--small" disabled={loading} onClick={() => void loadMore()}>{loading ? 'در حال بارگذاری…' : 'نمایش برنامه‌های بیشتر'}</button>}
    </details>
  );
}
