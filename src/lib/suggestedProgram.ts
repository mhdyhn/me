import { estimateMinutes } from '../data/workouts';
import { exerciseById } from '../data/exercises';
import type { WorkoutExercise, WorkoutTemplate } from '../types';
import { presetTemplates } from './programTemplates';
import { faDigits } from './format';

/**
 * The programme we suggest to a student who trains on their own.
 *
 * The coach's programme always wins for a coached student; this is the answer for the
 * independent student who asks "what should I do?". The student answers five short
 * questions and the app picks a base template, adjusts the volume to the level, and
 * swaps the movements that need equipment or hurt a joint the student cannot use.
 */

export type SuggestionGoal = 'strength' | 'muscle' | 'fatloss' | 'general';
export type SuggestionLevel = 'beginner' | 'intermediate' | 'advanced';
export type SuggestionEquipment = 'home' | 'gym';
export type SuggestionLimit = 'none' | 'knee' | 'shoulder' | 'back';

export interface SuggestionAnswers {
  goal: SuggestionGoal;
  level: SuggestionLevel;
  daysPerWeek: 2 | 3 | 4 | 5;
  equipment: SuggestionEquipment;
  limit: SuggestionLimit;
}

export interface SuggestedProgram {
  /** The base template the suggestion came from. */
  templateId: string;
  title: string;
  /** The days, already adjusted for level, equipment and the joint limit. */
  days: WorkoutTemplate[];
  /** Why this programme was picked, in plain Persian. */
  reasons: string[];
  /** What the student should know before starting. */
  warnings: string[];
}

export const defaultSuggestionAnswers: SuggestionAnswers = {
  goal: 'general',
  level: 'beginner',
  daysPerWeek: 3,
  equipment: 'gym',
  limit: 'none',
};

export const suggestionQuestions = [
  {
    id: 'goal' as const,
    title: 'هدف اصلی شما چیست؟',
    options: [
      { value: 'strength' as const, label: 'قدرت' },
      { value: 'muscle' as const, label: 'عضله‌سازی' },
      { value: 'fatloss' as const, label: 'کاهش چربی و تناسب' },
      { value: 'general' as const, label: 'سلامت عمومی و آمادگی' },
    ],
  },
  {
    id: 'level' as const,
    title: 'سابقهٔ تمرین شما چقدر است؟',
    options: [
      { value: 'beginner' as const, label: 'تازه‌کار' },
      { value: 'intermediate' as const, label: 'متوسط' },
      { value: 'advanced' as const, label: 'پیشرفته' },
    ],
  },
  {
    id: 'daysPerWeek' as const,
    title: 'هفته‌ای چند روز تمرین می‌کنید؟',
    options: [
      { value: 2 as const, label: '۲ روز' },
      { value: 3 as const, label: '۳ روز' },
      { value: 4 as const, label: '۴ روز' },
      { value: 5 as const, label: '۵ روز' },
    ],
  },
  {
    id: 'equipment' as const,
    title: 'به چه امکاناتی دسترسی دارید؟',
    options: [
      { value: 'gym' as const, label: 'باشگاه با دستگاه و هالتر' },
      { value: 'home' as const, label: 'خانه با دمبل یا وزن بدن' },
    ],
  },
  {
    id: 'limit' as const,
    title: 'محدودیت یا آسیبی دارید که باید رعایت شود؟',
    options: [
      { value: 'none' as const, label: 'ندارم' },
      { value: 'knee' as const, label: 'زانو' },
      { value: 'shoulder' as const, label: 'شانه' },
      { value: 'back' as const, label: 'کمر' },
    ],
  },
];

/** Movements that need a machine or a bar, with the home version that replaces them. */
const HOME_EXERCISE: Record<string, string> = {
  'barbell-squat': 'goblet-squat',
  'barbell-bench-press': 'flat-dumbbell-press',
  'incline-barbell-press': 'incline-dumbbell-press',
  'barbell-bent-over-row': 'one-arm-dumbbell-row',
  'seated-cable-row': 'one-arm-dumbbell-row',
  'lat-pulldown': 'pull-up',
  'pull-up': 'inverted-row',
  'cable-fly': 'dumbbell-chest-fly',
  'cable-crunch': 'dead-bug',
  'machine-crunch': 'dead-bug',
  'cable-triceps-pushdown': 'diamond-push-up',
  'overhead-cable-triceps-extension': 'diamond-push-up',
  'romanian-deadlift': 'dumbbell-romanian-deadlift',
  'barbell-curl': 'dumbbell-biceps-curl',
  'cable-curl': 'dumbbell-biceps-curl',
  'hammer-curl': 'dumbbell-biceps-curl',
  'face-pull': 'dumbbell-rear-delt-fly',
  'leg-press': 'bodyweight-squat',
  'leg-extension': 'glute-bridge',
  'leg-curl': 'glute-bridge',
};

/** Movements to avoid for a joint, with the gentler replacement. */
const LIMIT_EXERCISE: Record<SuggestionLimit, Record<string, string>> = {
  none: {},
  knee: {
    'barbell-squat': 'barbell-hip-thrust',
    'goblet-squat': 'glute-bridge',
    'leg-press': 'glute-bridge',
    'leg-extension': 'glute-bridge',
    'leg-curl': 'glute-bridge',
  },
  shoulder: {
    'shoulder-press': 'dumbbell-front-raise',
    'overhead-cable-triceps-extension': 'diamond-push-up',
    'incline-barbell-press': 'flat-dumbbell-press',
  },
  back: {
    'romanian-deadlift': 'barbell-hip-thrust',
    'barbell-squat': 'leg-press',
    'barbell-bent-over-row': 'chest-supported-dumbbell-row',
  },
};

const LEVEL_LABEL: Record<SuggestionLevel, string> = {
  beginner: 'تازه‌کار',
  intermediate: 'متوسط',
  advanced: 'پیشرفته',
};

const GOAL_LABEL: Record<SuggestionGoal, string> = {
  strength: 'قدرت',
  muscle: 'عضله‌سازی',
  fatloss: 'کاهش چربی',
  general: 'سلامت عمومی',
};

const LIMIT_LABEL: Record<SuggestionLimit, string> = {
  none: 'بدون محدودیت',
  knee: 'زانو',
  shoulder: 'شانه',
  back: 'کمر',
};

/** The Persian name of a movement, from the catalogue. */
function movementName(exerciseId: string): string {
  return exerciseById(exerciseId)?.name ?? exerciseId;
}

/** The base template that matches the number of days the student can train. */
function baseTemplate(daysPerWeek: number): { id: string; title: string } {
  if (daysPerWeek <= 3) {
    const template = presetTemplates.find((item) => item.id === 'fullbody-3day');
    return { id: template?.id ?? 'fullbody-3day', title: template?.title ?? 'برنامهٔ تمام بدن' };
  }
  if (daysPerWeek === 4) {
    const template = presetTemplates.find((item) => item.id === 'upper-lower-4day');
    return { id: template?.id ?? 'upper-lower-4day', title: template?.title ?? 'برنامهٔ بالاتنه/پایین‌تنه' };
  }
  const template = presetTemplates.find((item) => item.id === 'ppl-5day');
  return { id: template?.id ?? 'ppl-5day', title: template?.title ?? 'برنامهٔ تفکیکی' };
}

/** Sets and rest for the level of the student. */
function adjustForLevel(exercise: WorkoutExercise, level: SuggestionLevel, isMainLift: boolean): WorkoutExercise {
  const base = exercise.prescription;
  if (level === 'beginner') {
    return {
      ...exercise,
      prescription: {
        ...base,
        sets: Math.max(2, base.sets - 1),
        restSeconds: base.restSeconds + 30,
        targetRirLabel: '2–3',
        minimumRir: 2,
      },
    };
  }
  if (level === 'advanced' && isMainLift) {
    return {
      ...exercise,
      prescription: {
        ...base,
        sets: Math.min(5, base.sets + 1),
        restSeconds: Math.max(60, base.restSeconds - 15),
      },
    };
  }
  return exercise;
}

/** Reps and rest for the goal of the student. */
function adjustForGoal(exercise: WorkoutExercise, goal: SuggestionGoal, isMainLift: boolean): WorkoutExercise {
  const base = exercise.prescription;
  if (goal === 'muscle' && !isMainLift) {
    return {
      ...exercise,
      prescription: {
        ...base,
        minReps: base.minReps + 1,
        maxReps: base.maxReps + 1,
        restSeconds: Math.max(45, base.restSeconds - 15),
      },
    };
  }
  if (goal === 'strength' && !isMainLift) {
    return {
      ...exercise,
      prescription: {
        ...base,
        sets: Math.max(2, base.sets - 1),
        restSeconds: base.restSeconds + 15,
      },
    };
  }
  return exercise;
}

/**
 * The programme we suggest for the given answers.
 */
export function suggestProgram(answers: SuggestionAnswers): SuggestedProgram {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const base = baseTemplate(answers.daysPerWeek);
  const template = presetTemplates.find((item) => item.id === base.id);
  const sourceDays = template?.buildWorkoutTemplates() ?? [];

  // The goal of losing weight needs more days than the student asked for; the template is only
  // trimmed, never stretched, so the suggestion stays close to what the student can do.
  const wanted = answers.goal === 'fatloss' ? Math.max(3, answers.daysPerWeek) : answers.daysPerWeek;
  const days = sourceDays.slice(0, Math.min(wanted, sourceDays.length));

  const daysBuilt: WorkoutTemplate[] = days.map((day, dayIndex) => {
    const exercises = day.exercises.map((exercise, index) => {
      const isMainLift = index === 0;
      let next = adjustForLevel(exercise, answers.level, isMainLift);
      next = adjustForGoal(next, answers.goal, isMainLift);

      // The equipment comes first: a movement that needs a machine does not fit a home.
      const homeId = answers.equipment === 'home' ? (HOME_EXERCISE[exercise.exerciseId] ?? exercise.exerciseId) : exercise.exerciseId;
      if (homeId !== exercise.exerciseId) {
        next = { ...next, exerciseId: homeId, name: movementName(homeId) };
        warnings.push(`«${exercise.name}» با «${movementName(homeId)}» جایگزین شد تا در خانه هم قابل اجرا باشد.`);
      }

      // Then the joint: a movement that hurts the joint is replaced, not scaled.
      const limitId = LIMIT_EXERCISE[answers.limit][homeId] ?? homeId;
      if (limitId !== homeId) {
        next = { ...next, exerciseId: limitId, name: movementName(limitId) };
        warnings.push(`«${movementName(homeId)}» به‌خاطرِ ${LIMIT_LABEL[answers.limit]} با «${movementName(limitId)}» جایگزین شد.`);
      }
      return next;
    });

    return {
      ...day,
      id: `suggested-${day.id}`,
      name: day.name.replace(/^روز\s*\d+[:：]?\s*/, `روز ${faDigits(dayIndex + 1)}: `),
      dayLabel: `روز ${faDigits(String(dayIndex + 1).padStart(2, '0'))}`,
      durationMinutes: estimateMinutes(exercises),
      exercises,
    };
  });

  reasons.push(`برای ${GOAL_LABEL[answers.goal]} و سطح ${LEVEL_LABEL[answers.level]}، برنامهٔ «${base.title}» با ${faCount(daysBuilt.length)} روز در هفته پیشنهاد می‌شود.`);
  if (answers.level === 'beginner') {
    reasons.push('حجم و استراحتِ حرکت‌ها برای شروع کم شده است؛ هر هفته یک ست به حرکت‌های اصلی اضافه کنید.');
  }
  if (answers.level === 'advanced') {
    reasons.push('برای حرکت‌های اصلی هر روز یک ست بیشتر گذاشته شده و استراحت کمی کوتاه‌تر است.');
  }
  if (answers.goal === 'fatloss' && answers.daysPerWeek < 3) {
    warnings.push('برای کاهش چربی حداقل سه روز تمرین در هفته لازم است؛ برنامه با سه روز پیشنهاد شده است.');
  }
  if (answers.equipment === 'home') {
    reasons.push('همهٔ حرکت‌ها با دمبل یا وزن بدن انتخاب شده‌اند تا در خانه هم قابل اجرا باشند.');
  }
  if (answers.limit !== 'none') {
    warnings.push(`محدودیت ${LIMIT_LABEL[answers.limit]} در نظر گرفته شد؛ اگر درد یا ناراحتی داشتید، حرکت را حذف کنید.`);
  }

  return {
    templateId: base.id,
    title: base.title,
    days: daysBuilt,
    reasons,
    warnings,
  };
}

/** The number of days in Persian digits. */
function faCount(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)] ?? digit);
}
