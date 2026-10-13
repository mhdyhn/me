import { api } from './api';
import type { WorkoutSession } from '../types';

/** The server accepts this many sessions per request; the body size limit is set for a batch of this size. */
const PER_REQUEST = 20;
/** The coach sees the newest sessions. Older ones stay on the phone only. */
const NEWEST_LIMIT = 100;

/** Only what the coach needs: no rest timers or template internals. */
function summarize(session: WorkoutSession) {
  return {
    id: session.id,
    name: session.name,
    startedAt: session.startedAt,
    completedAt: session.completedAt ?? null,
    status: session.status,
    notes: session.notes ?? '',
    exercises: session.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map((set) => ({
        setNumber: set.setNumber,
        weightKg: set.weightKg,
        reps: set.reps,
        rir: set.rir,
        notes: set.notes ?? '',
        doneAt: set.doneAt,
      })),
    })),
  };
}

/**
 * Sends the newest workout summaries to the coach. Sessions are saved again on the server each time,
 * so a failed send is retried by the next change or the next start of the app.
 */
export async function uploadSessionSummaries(sessions: WorkoutSession[]): Promise<void> {
  // The list is already sorted newest first.
  const newest = sessions.slice(0, NEWEST_LIMIT);
  for (let start = 0; start < newest.length; start += PER_REQUEST) {
    const chunk = newest.slice(start, start + PER_REQUEST).map(summarize);
    await api('PUT', '/me/sessions', { sessions: chunk });
  }
}
