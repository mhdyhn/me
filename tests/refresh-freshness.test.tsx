import Dexie from 'dexie';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GymProvider, useGym } from '../src/context/GymProvider';
import { db } from '../src/lib/db';
import { PERSONAL_DATA_APPLIED } from '../src/lib/personalSyncEvents';
import { sampleProfile } from './fixtures/profile';
import type { WorkoutSession } from '../src/types';

const remote: WorkoutSession = {
  id: 'remote-session', templateId: 'day', name: 'جلسه', startedAt: '2026-10-30T08:00:00Z',
  status: 'completed', completedAt: '2026-10-30T09:00:00Z', notes: '',
  currentExerciseIndex: 0, currentSetIndex: 0, exercises: [],
};
function Probe() {
  const { sessions, profile, loading, refreshing, storageWarning, saveProfile } = useGym();
  return <>
    <output>{loading ? 'loading' : refreshing ? 'refreshing' : `ready:${sessions.length}`}</output>
    {storageWarning && <p role="alert">{storageWarning}</p>}
    <button onClick={() => void saveProfile(sampleProfile, profile)}>save profile</button>
  </>;
}
beforeEach(async () => { await db.sessions.clear(); await db.preferences.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('waits for a remote refresh and retries if a local save invalidates its read', async () => {
  render(<GymProvider><Probe /></GymProvider>);
  await screen.findByText('ready:0');
  await db.sessions.put(remote);
  const read = db.sessions.toArray.bind(db.sessions);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(db.sessions, 'toArray').mockImplementationOnce((() => Dexie.Promise.resolve(blocked).then(() => read())) as typeof db.sessions.toArray);
  act(() => window.dispatchEvent(new Event(PERSONAL_DATA_APPLIED)));
  expect(screen.getByText('refreshing')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'save profile' }));
  await waitFor(() => expect(screen.getByText('ready:1')).toBeInTheDocument());
  expect((await db.preferences.get('profile'))?.value).toEqual(sampleProfile);
  release();
  await waitFor(() => expect(screen.getByText('ready:1')).toBeInTheDocument());
});

it('cannot get stuck loading if a local write wins the initial read', async () => {
  const read = db.sessions.toArray.bind(db.sessions);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  vi.spyOn(db.sessions, 'toArray').mockImplementationOnce((() => Dexie.Promise.resolve(blocked).then(() => read())) as typeof db.sessions.toArray);
  render(<GymProvider><Probe /></GymProvider>);
  expect(screen.getByText('loading')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'save profile' }));
  await waitFor(() => expect(screen.getByText('ready:0')).toBeInTheDocument());
  expect((await db.preferences.get('profile'))?.value).toEqual(sampleProfile);
  release();
  await waitFor(() => expect(screen.getByText('ready:0')).toBeInTheDocument());
});


it('ends a failed refresh and surfaces the storage warning instead of waiting forever', async () => {
  render(<GymProvider><Probe /></GymProvider>);
  await screen.findByText('ready:0');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(db.sessions, 'toArray').mockImplementationOnce((() => Dexie.Promise.reject(new Error('read failed'))) as typeof db.sessions.toArray);
  act(() => window.dispatchEvent(new Event(PERSONAL_DATA_APPLIED)));
  expect(await screen.findByRole('alert')).toHaveTextContent('فضای ذخیره‌سازی محلی باز نشد');
  expect(screen.getByText('ready:0')).toBeInTheDocument();
});
