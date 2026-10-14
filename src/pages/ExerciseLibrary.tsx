import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { exercises } from '../data/exercises';
import { hasExerciseFigure, exerciseFigureSrc } from '../data/exerciseFigures';
import {
  type LyftaCategory,
  lyftaCategoryLabels,
  exerciseLyftaCategory,
  lyftaCategoryFilters as filters,
  exerciseSearchText,
} from '../data/exerciseCategories';
import { useProgram } from '../lib/programStore';
import { matchesPersianSearch } from '../lib/labels';
import { faDigits, faNumber } from '../lib/format';

export {
  type LyftaCategory,
  lyftaCategoryLabels,
  exerciseLyftaCategory,
};

export function ExerciseLibrary() {
  const program = useProgram();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<LyftaCategory>('All');
  const [onlyAssigned, setOnlyAssigned] = useState(false);

  const assignedIds = useMemo(
    () => new Set(program.flatMap((day) => day.exercises.map((item) => item.exerciseId))),
    [program],
  );

  const results = useMemo(() => exercises.filter((exercise) => {
    if (onlyAssigned && !assignedIds.has(exercise.id)) return false;
    const matchesCategory = category === 'All' || exerciseLyftaCategory[exercise.id] === category;
    if (!matchesCategory) return false;
    if (!search.trim()) return true;
    const searchable = exerciseSearchText(exercise);
    return matchesPersianSearch(searchable, search.trim());
  }), [search, category, onlyAssigned, assignedIds]);

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="آموزش حرکت‌ها" title="حرکت را درست یاد بگیر." description="راهنمای آماده‌سازی، مراحل روشن و نکته‌های اجرای صحیح برای همهٔ حرکت‌های برنامه به سبک Lyfta." />
      <div className="library-toolbar">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">جست‌وجوی حرکت‌ها</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جست‌وجو بر اساس نام فارسی، انگلیسی (Bench, Squat...)، عضله یا وسیله"
          />
        </label>
        <span className="library-result-count"><SlidersHorizontal size={15} /> {faNumber(results.length)} حرکت</span>
      </div>
      <div className="filter-tabs" role="group" aria-label="فیلتر حرکت‌ها بر اساس گروه عضلانی">
        {filters.map(({ id, label }) => <button key={id} className={`filter-tab${category === id && !onlyAssigned ? ' is-active' : ''}`} aria-pressed={category === id && !onlyAssigned} onClick={() => { setCategory(id); setOnlyAssigned(false); }}>{label}</button>)}
        {assignedIds.size > 0 && (
          <button
            className={`filter-tab${onlyAssigned ? ' is-active' : ''}`}
            aria-pressed={onlyAssigned}
            onClick={() => setOnlyAssigned(!onlyAssigned)}
          >
            برنامهٔ من ({faNumber(assignedIds.size)})
          </button>
        )}
      </div>
      {results.length ? (
        <div className="exercise-grid">
          {results.map((exercise, index) => {
            const prescription = program.flatMap((workout) => workout.exercises).find((item) => item.exerciseId === exercise.id)?.prescription;
            const lyftaCategory = exerciseLyftaCategory[exercise.id] ?? 'Chest';
            return (
              <Link to={`/exercise/${exercise.id}`} className="exercise-card" key={exercise.id}>
                <div className={`exercise-card__visual exercise-card__visual--${exercise.category.toLowerCase()}`}>
                  {hasExerciseFigure(exercise.id) && (
                    <img
                      src={exerciseFigureSrc(exercise.id, 'start')}
                      alt=""
                      className="exercise-card__thumb"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  <span className="exercise-card__number">{faDigits(String(index + 1).padStart(2, '0'))}</span>
                  <span className="exercise-card__category">{lyftaCategoryLabels[lyftaCategory]}</span>
                  {!hasExerciseFigure(exercise.id) && <div className="exercise-card__visual-mark"><span /><span /><span /></div>}
                  <ArrowUpRight size={17} className="exercise-card__arrow" />
                </div>
                <div className="exercise-card__body">
                  <h3>{exercise.name}</h3>
                  {exercise.englishName && (
                    <span className="account-muted" dir="ltr" style={{ display: 'block', fontSize: 11, marginTop: -2, marginBottom: 2 }}>
                      {exercise.englishName}
                    </span>
                  )}
                  <p>{exercise.primaryMuscles.join(' · ')}{exercise.secondaryMuscles.length ? ` · ${exercise.secondaryMuscles[0]}` : ''}</p>
                  <div className="exercise-card__footer">
                    <span>{exercise.equipment[0] ?? 'وزن بدن'}</span>
                    {prescription && <span>{faNumber(prescription.sets)} × {faNumber(prescription.minReps)}–{faNumber(prescription.maxReps)}</span>}
                  </div>
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
