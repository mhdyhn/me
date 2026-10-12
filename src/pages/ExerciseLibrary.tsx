import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { exercises } from '../data/exercises';
import { isProgramReadOnly, useProgram } from '../lib/programStore';
import { categoryLabels, normalizePersianSearch } from '../lib/labels';
import { faDigits, faNumber } from '../lib/format';
import type { ExerciseDefinition } from '../types';

const filters: ({ id: ExerciseDefinition['category'] | 'All'; label: string })[] = [
  { id: 'All', label: 'همه' },
  { id: 'Push', label: categoryLabels.Push },
  { id: 'Pull', label: categoryLabels.Pull },
  { id: 'Legs', label: categoryLabels.Legs },
  { id: 'Core', label: categoryLabels.Core },
];

export function ExerciseLibrary() {
  const program = useProgram();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<(typeof filters)[number]['id']>('All');
  // A student's library is limited to the movements in the coach's programme.
  const assignedIds = useMemo(
    () => (isProgramReadOnly() ? new Set(program.flatMap((day) => day.exercises.map((item) => item.exerciseId))) : null),
    [program],
  );
  const results = useMemo(() => exercises.filter((exercise) => {
    if (assignedIds && !assignedIds.has(exercise.id)) return false;
    const matchesCategory = category === 'All' || exercise.category === category;
    const searchable = normalizePersianSearch([exercise.name, ...exercise.primaryMuscles, ...exercise.secondaryMuscles, ...exercise.equipment].join(' '));
    return matchesCategory && searchable.includes(normalizePersianSearch(search));
  }), [search, category, assignedIds]);

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="آموزش حرکت‌ها" title="حرکت را درست یاد بگیر." description="راهنمای آماده‌سازی، مراحل روشن و نکته‌های اجرای صحیح برای همهٔ حرکت‌های برنامه." />
      <div className="library-toolbar">
        <label className="search-field"><Search size={18} /><span className="sr-only">جست‌وجوی حرکت‌ها</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو بر اساس حرکت، عضله یا وسیله" /></label>
        <span className="library-result-count"><SlidersHorizontal size={15} /> {faNumber(results.length)} حرکت</span>
      </div>
      <div className="filter-tabs" role="group" aria-label="فیلتر حرکت‌ها بر اساس گروه عضلانی">
        {filters.map(({ id, label }) => <button key={id} className={`filter-tab${category === id ? ' is-active' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}</button>)}
      </div>
      {results.length ? (
        <div className="exercise-grid">
          {results.map((exercise, index) => {
            const prescription = program.flatMap((workout) => workout.exercises).find((item) => item.exerciseId === exercise.id)?.prescription;
            return (
              <Link to={`/exercise/${exercise.id}`} className="exercise-card" key={exercise.id}>
                <div className={`exercise-card__visual exercise-card__visual--${exercise.category.toLowerCase()}`}>
                  <span className="exercise-card__number">{faDigits(String(index + 1).padStart(2, '0'))}</span>
                  <span className="exercise-card__category">{categoryLabels[exercise.category]}</span>
                  <div className="exercise-card__visual-mark"><span /><span /><span /></div>
                  <ArrowUpRight size={17} className="exercise-card__arrow" />
                </div>
                <div className="exercise-card__body">
                  <h3>{exercise.name}</h3>
                  <p>{exercise.primaryMuscles.join(' · ')}{exercise.secondaryMuscles.length ? ` · ${exercise.secondaryMuscles[0]}` : ''}</p>
                  <div className="exercise-card__footer"><span>{exercise.equipment[0]}</span>{prescription && <span>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</span>}</div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="library-empty"><Search size={20} /><h3>حرکتی پیدا نشد</h3><p>نام دیگری، گروه عضلانی یا وسیله‌ای دیگر را جست‌وجو کنید.</p><button className="text-button" onClick={() => { setSearch(''); setCategory('All'); }}>پاک‌کردن فیلترها</button></div>
      )}
    </div>
  );
}
