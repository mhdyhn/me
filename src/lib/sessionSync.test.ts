import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadSessionSummaries } from './sessionSync';
import type { WorkoutSession } from '../types';

/** Sessions newest first, one day apart, as the provider keeps them. */
function makeSessions(count: number): WorkoutSession[] {
  const day = 24 * 60 * 60 * 1000;
  const base = Date.UTC(2026, 9, 13, 8);
  return Array.from({ length: count }, (_, index) => {
    const startedAt = new Date(base - index * day).toISOString();
    return {
      id: `session-${index}`,
      templateId: 'push-day',
      name: 'روز پوش',
      startedAt,
      completedAt: new Date(base - index * day + 60 * 60 * 1000).toISOString(),
      status: 'completed',
      notes: '',
      exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [{ setNumber: 1, weightKg: 20, reps: 8, rir: 2, notes: '', doneAt: startedAt }] }],
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      restTimer: { endsAt: null, pausedRemainingSeconds: null },
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadSessionSummaries', () => {
  it('sends the newest 100 sessions in batches of 20, without the rest timer', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, saved: 20 }) }));
    vi.stubGlobal('fetch', fetchMock);

    await uploadSessionSummaries(makeSessions(120));

    expect(fetchMock).toHaveBeenCalledTimes(5);
    const sent: { sessions: Array<Record<string, unknown>> }[] = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call as unknown as [string, { body: string }])[1].body)),
    );
    expect(sent.map((batch) => batch.sessions.length)).toEqual([20, 20, 20, 20, 20]);
    const all = sent.flatMap((batch) => batch.sessions);
    expect(all[0]!.id).toBe('session-0');
    expect(all[99]!.id).toBe('session-99');
    expect(all.some((session) => 'restTimer' in session)).toBe(false);
    expect(all[0]!.exercises).toEqual([
      { exerciseId: 'flat-dumbbell-press', sets: [{ setNumber: 1, weightKg: 20, reps: 8, rir: 2, notes: '', doneAt: all[0]!.startedAt }] },
    ]);
  });

  it('does nothing when there are no sessions', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await uploadSessionSummaries([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
