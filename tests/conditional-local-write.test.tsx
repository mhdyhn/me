import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GymProvider, useGym } from '../src/context/GymProvider';
import { defaultProfile } from '../src/data/profile';
import { db } from '../src/lib/db';
import { originalProgramCopy } from '../src/lib/programStore';
import { clearProgram, saveProgram } from '../src/lib/programPersistence';
import type { WorkoutSession } from '../src/types';

const session: WorkoutSession = { id: 'session-1', templateId: 'day', name: 'تمرین', startedAt: '2026-10-20T10:00:00Z', status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0, exercises: [] };
const day = { id: '2026-10-27', date: '2026-10-27', notes: 'قدیمی' };

function Harness() {
  const { profile, nutritionGoals, nutritionDays, sessions, loading, saveProfile, saveNutritionGoals, saveNutritionDay, saveSession } = useGym();
  const [result, setResult] = useState('');
  const write = async (action: () => Promise<unknown>) => {
    try { await action(); setResult('saved'); } catch (error) { setResult(error instanceof Error ? error.message : 'error'); }
  };
  if (loading) return <span>loading</span>;
  return <>
    <span data-testid="age">{profile.age}</span>
    <button onClick={() => void write(() => saveProfile({ ...profile, age: 29 }, profile))}>profile</button>
    <button onClick={() => void write(() => saveNutritionGoals({ ...nutritionGoals, proteinG: 150 }, nutritionGoals))}>goals</button>
    <button onClick={() => void write(() => saveNutritionDay({ ...nutritionDays[0]!, notes: 'mine' }, nutritionDays[0] ?? null))}>day</button>
    <button onClick={() => void write(() => saveSession({ ...sessions[0]!, notes: 'mine' }, sessions[0]))}>session</button>
    <span role="status">{result}</span>
  </>;
}

beforeEach(async () => {
  await Promise.all([db.preferences.clear(), db.nutritionDays.clear(), db.sessions.clear(), db.syncMetadata.clear(), db.syncDeleted.clear()]);
  await db.preferences.put({ key: 'profile', value: { ...defaultProfile, age: 28 } });
  await db.preferences.put({ key: 'nutritionGoals', value: { proteinG: 100 } });
  await db.nutritionDays.put(day);
  await db.sessions.put(session);
});
afterEach(() => cleanup());

describe('atomic local draft checks', () => {
  it.each(['profile', 'goals', 'day', 'session'] as const)('does not overwrite a newer %s even before the UI refresh event', async (kind) => {
    render(<GymProvider><Harness /></GymProvider>);
    await screen.findByText('28');
    if (kind === 'profile') await db.preferences.put({ key: 'profile', value: { ...defaultProfile, age: 30 } });
    if (kind === 'goals') await db.preferences.put({ key: 'nutritionGoals', value: { proteinG: 200 } });
    if (kind === 'day') await db.nutritionDays.put({ ...day, notes: 'جدید' });
    if (kind === 'session') await db.sessions.put({ ...session, notes: 'جدید' });
    fireEvent.click(screen.getByRole('button', { name: kind }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('هنگام ویرایش'));
    if (kind === 'profile') expect((await db.preferences.get('profile'))?.value).toMatchObject({ age: 30 });
    if (kind === 'goals') expect((await db.preferences.get('nutritionGoals'))?.value).toEqual({ proteinG: 200 });
    if (kind === 'day') expect((await db.nutritionDays.get(day.id))?.notes).toBe('جدید');
    if (kind === 'session') expect((await db.sessions.get(session.id))?.notes).toBe('جدید');
  });

  it('prevents a stale programme editor from replacing or deleting a newer programme', async () => {
    const first = originalProgramCopy();
    const newer = structuredClone(first); newer[0]!.name = 'جدید';
    await db.preferences.put({ key: 'programTemplates', value: newer });
    await expect(saveProgram(first, first)).rejects.toThrow(/هنگام ویرایش/);
    await expect(clearProgram(first)).rejects.toThrow(/هنگام ویرایش/);
    expect((await db.preferences.get('programTemplates'))?.value).toEqual(newer);
    await clearProgram(newer);
    expect((await db.preferences.get('programTemplates'))?.value).toEqual([]);
  });
});
