import { lyftaMetaExercises } from './lyftaCatalogueExercises';

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

export const lyftaCategoryFilters: { id: LyftaCategory; label: string }[] = [
  { id: 'All', label: lyftaCategoryLabels.All },
  { id: 'Chest', label: lyftaCategoryLabels.Chest },
  { id: 'Back', label: lyftaCategoryLabels.Back },
  { id: 'Shoulders', label: lyftaCategoryLabels.Shoulders },
  { id: 'Biceps', label: lyftaCategoryLabels.Biceps },
  { id: 'Triceps', label: lyftaCategoryLabels.Triceps },
  { id: 'Legs', label: lyftaCategoryLabels.Legs },
  { id: 'Core', label: lyftaCategoryLabels.Core },
];
