import { ApiError, api, getToken, type Programme, type ProgramItem } from './api';
import type { WorkoutExercise, WorkoutTemplate } from '../types';
import { setAssignedMeta, setAssignedProgram, setAssignedProgramLoadState } from './programStore';
import { isValidReps, normalizeReps } from '../../shared/repetitions';

/** Reads "8-12" or "8" into a range. Anything else falls back to 8–12. */
export function parseReps(reps: string): { minReps: number; maxReps: number } {
  const normalized = normalizeReps(reps);
  const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(normalized);
  if (!match || !isValidReps(normalized)) return { minReps: 8, maxReps: 12 };
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;
  return { minReps: Math.min(min, max), maxReps: Math.max(min, max) };
}

function toExercise(item: ProgramItem): WorkoutExercise {
  const { minReps, maxReps } = parseReps(item.reps);
  return {
    exerciseId: item.exerciseId,
    name: item.name,
    prescription: {
      sets: item.sets,
      minReps,
      maxReps,
      targetRirLabel: 'طبق نظر مربی',
      minimumRir: 0,
      restSeconds: item.restSeconds,
      note: 'از برنامهٔ مربی شما',
    },
  };
}

/** Turns the coach's programme into the same shape the personal programme uses, so every screen can show it. */
export function assignedToTemplates(program: Programme): WorkoutTemplate[] {
  return program.days.map((day, index) => {
    const exercises = day.exercises.map(toExercise);
    const muscles = [...new Set(day.exercises.map((item) => item.muscle).filter(Boolean))];
    const minutes = day.exercises.reduce((sum, item) => sum + (item.sets * (40 + item.restSeconds)) / 60, 0);
    return {
      id: `assigned-day-${index + 1}`,
      name: day.name,
      dayLabel: `روز ${index + 1}`,
      focus: muscles.join(' · '),
      durationMinutes: Math.max(1, Math.round(minutes)),
      description: program.title,
      exercises,
    };
  });
}

let assignedLoadVersion = 0;

/** Loads only the latest programme response for the session that started the request. */
export async function loadAssignedProgram(): Promise<void> {
  const requestVersion = ++assignedLoadVersion;
  const sessionToken = getToken();
  const stillCurrent = () => requestVersion === assignedLoadVersion && getToken() === sessionToken;
  setAssignedProgramLoadState('loading');
  try {
    const result = await api<{
      program: Programme | null; coachName?: string | null; isPaid?: boolean;
      isTestPurchase?: boolean; testPurchaseAvailable?: boolean; testPurchaseExpiresAt?: string | null;
    }>('GET', '/me/program');
    if (!stillCurrent()) return;
    if (result.program) {
      const isTestPurchase = result.isTestPurchase === true;
      setAssignedMeta({
        id: result.program.id,
        version: result.program.version,
        title: result.program.title,
        priceTomans: result.program.priceTomans ?? 0,
        coachName: result.coachName ?? null,
        isPaid: result.isPaid !== false,
        isTestPurchase,
        testPurchaseAvailable: result.testPurchaseAvailable === true,
        testPurchaseExpiresAt: result.testPurchaseExpiresAt ?? null,
      });
      if (result.isPaid !== false || isTestPurchase) {
        setAssignedProgram(assignedToTemplates(result.program));
      } else {
        setAssignedProgram([]);
      }
    } else {
      setAssignedMeta(null);
      setAssignedProgram([]);
    }
    setAssignedProgramLoadState('ready');
  } catch (error) {
    if (!stillCurrent()) return;
    setAssignedProgramLoadState('error');
    if (!(error instanceof ApiError && error.status === 401)) {
      console.error('Meety could not load the coach programme.', error);
    }
  }
}
