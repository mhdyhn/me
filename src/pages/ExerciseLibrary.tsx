import { ArrowUpRight, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeading } from '../components/SectionHeading';
import { exercises } from '../data/exercises';
import { lyftaMetaExercises } from '../data/lyftaCatalogueExercises';
import { useProgram } from '../lib/programStore';
import { normalizePersianSearch } from '../lib/labels';
import { faDigits, faNumber } from '../lib/format';

export type LyftaCategory =
  | 'All'
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Legs'
  | 'Core';

export const lyftaCategoryLabels: Record<LyftaCategory, string> = {
  All: 'همه',
  Chest: 'سینه',
  Back: 'پشت و زیربغل',
  Shoulders: 'سرشانه',
  Biceps: 'جلو بازو',
  Triceps: 'پشت بازو',
  Legs: 'پا',
  Core: 'شکم و میان‌تنه',
};

export const exerciseLyftaCategory: Record<string, LyftaCategory> = {
  // Chest (8)
  'barbell-bench-press': 'Chest',
  'flat-dumbbell-press': 'Chest',
  'incline-dumbbell-press': 'Chest',
  'incline-barbell-press': 'Chest',
  'decline-dumbbell-press': 'Chest',
  'machine-chest-press': 'Chest',
  'cable-fly': 'Chest',
  'swedish-dip': 'Chest',

  // Back (10)
  'seated-cable-row': 'Back',
  'lat-pulldown': 'Back',
  'neutral-grip-lat-pulldown': 'Back',
  'reverse-grip-lat-pulldown': 'Back',
  'barbell-bent-over-row': 'Back',
  'one-arm-dumbbell-row': 'Back',
  'machine-row': 'Back',
  'close-grip-cable-row': 'Back',
  'parallel-grip-pull-up': 'Back',
  'dead-hang': 'Back',

  // Shoulders (9)
  'face-pull': 'Shoulders',
  'shoulder-press': 'Shoulders',
  'standing-barbell-press': 'Shoulders',
  'smith-shoulder-press': 'Shoulders',
  'cable-shoulder-press': 'Shoulders',
  'lateral-raise': 'Shoulders',
  'cable-lateral-raise': 'Shoulders',
  'machine-lateral-raise': 'Shoulders',
  'reverse-fly': 'Shoulders',

  // Biceps (8)
  'barbell-curl': 'Biceps',
  'dumbbell-biceps-curl': 'Biceps',
  'hammer-curl': 'Biceps',
  'cable-curl': 'Biceps',
  'incline-dumbbell-curl': 'Biceps',
  'ez-bar-curl': 'Biceps',
  'close-grip-barbell-curl': 'Biceps',
  'crossbody-hammer-curl': 'Biceps',

  // Triceps (6)
  'cable-triceps-pushdown': 'Triceps',
  'rope-triceps-pushdown': 'Triceps',
  'cable-triceps-single-arm': 'Triceps',
  'overhead-cable-triceps-extension': 'Triceps',
  'two-hand-dumbbell-overhead-triceps': 'Triceps',
  'machine-triceps-extension': 'Triceps',

  // Legs (11)
  'barbell-squat': 'Legs',
  'bodyweight-squat': 'Legs',
  'bulgarian-split-squat': 'Legs',
  'leg-press': 'Legs',
  'romanian-deadlift': 'Legs',
  'sumo-deadlift': 'Legs',
  'single-leg-cable-rdl': 'Legs',
  'leg-extension': 'Legs',
  'leg-curl': 'Legs',
  'standing-calf-raise': 'Legs',
  'seated-calf-raise': 'Legs',

  // Core / Abs (4)
  'cable-crunch': 'Core',
  'machine-crunch': 'Core',
  'hanging-leg-raise': 'Core',
  'hollow-hold': 'Core',
};

// Map additional standard Lyfta catalogue movements into their Lyfta categories
for (const meta of lyftaMetaExercises) {
  exerciseLyftaCategory[meta.id] = meta.lyftaCategory;
}

const filters: { id: LyftaCategory; label: string }[] = [
  { id: 'All', label: lyftaCategoryLabels.All },
  { id: 'Chest', label: lyftaCategoryLabels.Chest },
  { id: 'Back', label: lyftaCategoryLabels.Back },
  { id: 'Shoulders', label: lyftaCategoryLabels.Shoulders },
  { id: 'Biceps', label: lyftaCategoryLabels.Biceps },
  { id: 'Triceps', label: lyftaCategoryLabels.Triceps },
  { id: 'Legs', label: lyftaCategoryLabels.Legs },
  { id: 'Core', label: lyftaCategoryLabels.Core },
];

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
    const searchable = normalizePersianSearch([
      exercise.name,
      exercise.englishName ?? '',
      ...exercise.primaryMuscles,
      ...exercise.secondaryMuscles,
      ...exercise.equipment,
    ].join(' '));
    return matchesCategory && searchable.includes(normalizePersianSearch(search));
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
                  <span className="exercise-card__number">{faDigits(String(index + 1).padStart(2, '0'))}</span>
                  <span className="exercise-card__category">{lyftaCategoryLabels[lyftaCategory]}</span>
                  <div className="exercise-card__visual-mark"><span /><span /><span /></div>
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
