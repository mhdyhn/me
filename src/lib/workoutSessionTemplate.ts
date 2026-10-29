import type { WorkoutSession, WorkoutTemplate } from '../types';
import type { AssignedMeta } from './programStore';

/** Resume only a captured prescription or an entitled, unchanged temporary offer. */
export function workoutSessionTemplate(
  session: WorkoutSession,
  current?: WorkoutTemplate,
  assigned?: AssignedMeta | null,
): WorkoutTemplate | undefined {
  if (session.templateSnapshot) return session.templateSnapshot;
  const reference = session.templateReference;
  const validTest = assigned?.isTestPurchase === true && Boolean(assigned.testPurchaseExpiresAt)
    && Date.parse(assigned.testPurchaseExpiresAt!) > Date.now();
  if (!reference || !assigned || (!assigned.isPaid && !validTest)
    || assigned.id !== reference.programmeId || assigned.version !== reference.version
    || !current || current.id !== session.templateId || current.name !== session.name
    || current.exercises.length !== session.exercises.length) return undefined;
  return current.exercises.every((exercise, index) => exercise.exerciseId === session.exercises[index]?.exerciseId) ? current : undefined;
}
