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

  // Back (11)
  'seated-cable-row': 'Back',
  'lat-pulldown': 'Back',
  'neutral-grip-lat-pulldown': 'Back',
  'reverse-grip-lat-pulldown': 'Back',
  'single-arm-lat-pulldown': 'Back',
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

/** Common Persian gym nicknames and search aliases for movements */
export const exerciseSearchAliases: Record<string, string[]> = {
  'neutral-grip-lat-pulldown': ['دست خنثی', 'زیر بغل سیم‌کش دست خنثی', 'زیربغل سیمکش دست خنثی', 'سیم کش دست خنثی', 'لت دست خنثی', 'لت خنثی', 'لت موازی', 'گیرش خنثی'],
  'lat-pulldown': ['لت', 'لت سیم کش', 'لت سیمکش', 'زیربغل لت'],
  'reverse-grip-lat-pulldown': ['لت مچ برعکس', 'زیربغل مچ برعکس'],
  'single-arm-lat-pulldown': [
    'لت تک دست',
    'لت تکدست',
    'زیر بغل تک دست',
    'زیربغل تک دست',
    'لت پول دان تک دست',
    'لت پولدان تک دست',
    'لت پول دان',
    'لت تک',
    'سیم کش تک دست',
    'سیم‌کش تک‌دست',
    'تک دست زیر بغل',
    'پول دان تک دست',
  ],
  'incline-cable-fly': [
    'کراس اور از پایین به بالا',
    'کراس‌اور از پایین به بالا',
    'کراس اوور از پایین به بالا',
    'کراس‌اوور از پایین به بالا',
    'کراس اوور از پایین',
    'کراس اور از پایین',
    'کراس از پایین',
    'کابل کراس از پایین',
    'سیم کش از پایین به بالا',
    'سیم‌کش از پایین به بالا',
    'قفسه بالاسینه سیم کش',
    'فلای سیم کش از پایین',
    'فلای از پایین به بالا',
  ],
  'cable-crossover': [
    'کراس اور از بالا',
    'کراس‌اور از بالا',
    'کراس اوور از بالا',
    'کراس‌اوور از بالا',
    'کراس از بالا',
    'کابل کراس از بالا',
    'کراس اور',
    'کراس اوور',
    'کراس‌اوور',
    'کابل کراس',
    'کراس‌اور سیم‌کش',
  ],
  'machine-row': ['قایقی دستگاه', 'زیربغل دستگاه', 'روئینگ دستگاه', 'تکیه گاه سینه', 'تکیه‌گاه سینه', 'زیر بغل دستگاه با تکیه گاه سینه', 'زیر بغل دستگاه'],
  'straight-arm-pulldown': ['پلاور سیم کش', 'پلاور سیمکش', 'لت دست صاف'],
  'seated-cable-row': ['قایقی', 'روئینگ', 'روینگ سیم کش'],
  'barbell-bench-press': ['پرس سینه', 'پرس بنچ', 'نیمکت'],
  'incline-dumbbell-press': ['بالاسینه', 'بالا سینه', 'شیبدار'],
  'barbell-squat': ['اسکات', 'اسکوات پا', 'اسکات پا'],
  'romanian-deadlift': ['ددلیفت', 'ار دی ال', 'RDL'],
  'cable-crunch': ['کرانچ', 'شکم سیم کش'],
  'plank': ['پلانک', 'پلنک'],
};

export function exerciseSearchText(exercise: { id: string; name: string; englishName?: string; primaryMuscles: string[]; equipment: string[] }): string {
  const aliases = exerciseSearchAliases[exercise.id] ?? [];
  return [
    exercise.name,
    exercise.englishName ?? '',
    ...exercise.primaryMuscles,
    ...exercise.equipment,
    ...aliases,
  ].join(' ');
}
