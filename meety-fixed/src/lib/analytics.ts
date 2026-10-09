import { exerciseName } from '../data/exerciseNames';
import { faNumber } from './format';
import { primaryWorkoutTemplates, workoutTemplates } from '../data/workouts';
import type { ExercisePrescription, LoggedSet, WorkoutSession, WorkoutTemplate } from '../types';
import { getWeekSchedule } from './program';

export interface SessionTotals {
  exerciseCount: number;
  setCount: number;
  repCount: number;
  volumeKg: number;
  durationSeconds: number;
}

export interface ExercisePerformance {
  session: WorkoutSession;
  exerciseId: string;
  sets: LoggedSet[];
}

export interface RecordHighlight {
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  date: string;
  sessionId: string;
}

export const getSessionTotals = (session: WorkoutSession): SessionTotals => {
  const loggedExercises = session.exercises.filter((exercise) => exercise.sets.length > 0);
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const end = session.completedAt ? new Date(session.completedAt).getTime() : Date.now();
  const start = new Date(session.startedAt).getTime();
  return {
    exerciseCount: loggedExercises.length,
    setCount: sets.length,
    repCount: sets.reduce((total, set) => total + set.reps, 0),
    volumeKg: sets.reduce((total, set) => total + set.weightKg * set.reps, 0),
    durationSeconds: Math.max(0, Math.floor((end - start) / 1000)),
  };
};

export const getExercisePerformances = (
  sessions: WorkoutSession[],
  exerciseId: string,
  excludeSessionId?: string,
): ExercisePerformance[] => sessions
  .filter((session) => session.status === 'completed' && session.id !== excludeSessionId)
  .map((session) => ({
    session,
    exerciseId,
    sets: session.exercises.find((item) => item.exerciseId === exerciseId)?.sets ?? [],
  }))
  .filter((performance) => performance.sets.length > 0)
  .sort((a, b) => new Date(b.session.startedAt).getTime() - new Date(a.session.startedAt).getTime());

export const getLastExercisePerformance = (
  sessions: WorkoutSession[],
  exerciseId: string,
  excludeSessionId?: string,
) => getExercisePerformances(sessions, exerciseId, excludeSessionId)[0] ?? null;

export const getBestSet = (sessions: WorkoutSession[], exerciseId: string) => {
  const sets = getExercisePerformances(sessions, exerciseId).flatMap((item) => item.sets);
  return sets.reduce<LoggedSet | null>((best, set) => {
    if (!best || set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps)) return set;
    return best;
  }, null);
};

export const getRecentRecord = (sessions: WorkoutSession[]): RecordHighlight | null => {
  const completed = sessions
    .filter((session) => session.status === 'completed')
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  let latest: RecordHighlight | null = null;

  completed.forEach((session, sessionIndex) => {
    session.exercises.forEach((sessionExercise) => {
      const label = exerciseName(sessionExercise.exerciseId);
      const priorSets = completed
        .slice(0, sessionIndex)
        .flatMap((prior) => prior.exercises.find((item) => item.exerciseId === sessionExercise.exerciseId)?.sets ?? []);
      sessionExercise.sets.forEach((set) => {
        const isBest = priorSets.length > 0 && priorSets.every((prior) => set.weightKg > prior.weightKg || (set.weightKg === prior.weightKg && set.reps > prior.reps));
        if (isBest) {
          latest = {
            exerciseId: sessionExercise.exerciseId,
            exerciseName: label,
            weightKg: set.weightKg,
            reps: set.reps,
            date: session.startedAt,
            sessionId: session.id,
          };
        }
      });
    });
  });
  return latest;
};

export const getWeekStart = (date = new Date()) => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = start.getDay();
  start.setDate(start.getDate() - ((weekday + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getCompletedThisWeek = (sessions: WorkoutSession[], now = new Date()) => {
  const start = getWeekStart(now).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => {
    if (session.status !== 'completed' || !primaryWorkoutTemplates.some((workout) => workout.id === session.templateId)) return false;
    const started = new Date(session.startedAt).getTime();
    return started >= start && started < end;
  }).length;
};

export const getCurrentStreak = (sessions: WorkoutSession[], now = new Date()) => {
  const completedDays = new Set(sessions
    .filter((session) => session.status === 'completed')
    .map((session) => {
      const date = new Date(session.startedAt);
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }));
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
  const yesterday = new Date(cursor);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;
  if (!completedDays.has(todayKey) && !completedDays.has(yesterdayKey)) return 0;
  if (!completedDays.has(todayKey)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (completedDays.has(`${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
};

export interface WeekTotals {
  /** Monday 00:00 of the week, local time. */
  start: Date;
  sessionCount: number;
  setCount: number;
  repCount: number;
  volumeKg: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Completed sessions bucketed into Monday-start weeks, oldest week first so a
 * right-to-left chart reads the same way as the other timelines in the app.
 * Every completed session counts, including the optional low-fatigue day.
 */
export const getWeeklyTotals = (sessions: WorkoutSession[], weeks = 6, now = new Date()): WeekTotals[] => {
  const thisWeek = getWeekStart(now).getTime();
  const totals = Array.from({ length: weeks }, (_, index) => ({
    start: new Date(thisWeek - (weeks - 1 - index) * WEEK_MS),
    sessionCount: 0,
    setCount: 0,
    repCount: 0,
    volumeKg: 0,
  }));
  sessions
    .filter((session) => session.status === 'completed')
    .forEach((session) => {
      const started = new Date(session.startedAt).getTime();
      const offset = Math.floor((started - thisWeek) / WEEK_MS);
      const index = weeks - 1 + offset;
      const bucket = totals[index];
      if (!bucket) return;
      const logged = getSessionTotals(session);
      bucket.sessionCount += 1;
      bucket.setCount += logged.setCount;
      bucket.repCount += logged.repCount;
      bucket.volumeKg += logged.volumeKg;
    });
  return totals;
};

export interface WeekComparison {
  current: WeekTotals;
  previous: WeekTotals;
  volumeChange: number;
  /** `null` when last week had no volume to compare against. */
  volumeChangePercent: number | null;
  sessionChange: number;
}

/** The last two buckets of `getWeeklyTotals`, ready for a week-over-week card. */
export const getWeekComparison = (weeks: WeekTotals[]): WeekComparison | null => {
  const current = weeks.at(-1);
  const previous = weeks.at(-2);
  if (!current || !previous) return null;
  const volumeChange = current.volumeKg - previous.volumeKg;
  return {
    current,
    previous,
    volumeChange,
    volumeChangePercent: previous.volumeKg > 0 ? (volumeChange / previous.volumeKg) * 100 : null,
    sessionChange: current.sessionCount - previous.sessionCount,
  };
};

export const getNextWorkout = (sessions: WorkoutSession[], date = new Date()): WorkoutTemplate | null => {
  const scheduled = getWeekSchedule(date);
  if (!scheduled) return null;
  const dayKey = date.toDateString();
  const alreadyDoneToday = sessions.some((session) => session.status === 'completed' && session.templateId === scheduled.id && new Date(session.startedAt).toDateString() === dayKey);
  if (!alreadyDoneToday) return scheduled;
  const nextDays = [1, 2, 3, 4].map((offset) => {
    const candidate = new Date(date);
    candidate.setDate(candidate.getDate() + offset);
    return candidate;
  });
  for (const candidate of nextDays) {
    const workout = getWeekSchedule(candidate);
    if (!workout) continue;
    const key = candidate.toDateString();
    const done = sessions.some((session) => session.status === 'completed' && session.templateId === workout.id && new Date(session.startedAt).toDateString() === key);
    if (!done) return workout;
  }
  return null;
};

export const getProgressionAdvice = (
  prescription: ExercisePrescription,
  sets: LoggedSet[],
): { title: string; detail: string; readyToIncrease: boolean } => {
  if (sets.length < prescription.sets) {
    return {
      title: 'با همین وزنه، تکرارها را بیشتر کن',
      detail: `${faNumber(prescription.sets)} ست کاری را در بازهٔ ${faNumber(prescription.minReps)} تا ${faNumber(prescription.maxReps)} تکرار کامل کن و دست‌کم ${faNumber(prescription.minimumRir)} تکرار در ذخیره نگه دار.`,
      readyToIncrease: false,
    };
  }
  const allSetsAtTop = sets.slice(0, prescription.sets).every(
    (set) => set.reps >= prescription.maxReps && set.rir >= prescription.minimumRir,
  );
  if (allSetsAtTop) {
    return {
      title: 'می‌توانی افزایش کوچکی را بررسی کنی',
      detail: `همهٔ ست‌های کاری به ${faNumber(prescription.maxReps)} تکرار رسیده‌اند و میزان هدفِ تکرار در ذخیره را حفظ کرده‌اند. اگر فرم حرکت همچنان خوب بود، جلسهٔ بعد کوچک‌ترین افزایش وزنهٔ در دسترس را در نظر بگیر.`,
      readyToIncrease: true,
    };
  }
  return {
    title: 'وزنه را ثابت نگه دار و تکرارها را بیشتر کن',
    detail: `جلسهٔ بعد در مجموع یک یا دو تکرار به ست‌ها اضافه کن. تا وقتی همهٔ ست‌ها به ${faNumber(prescription.maxReps)} تکرار و میزان هدفِ تکرار در ذخیره نرسیده‌اند، وزنه را تغییر نده.`,
    readyToIncrease: false,
  };
};

export const formatRir = (rir: number) => `${faNumber(rir)} تکرار در ذخیره`;
