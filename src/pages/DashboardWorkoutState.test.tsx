import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { WorkoutSession, WorkoutTemplate } from '../types';
import type { PersonalSyncState } from '../lib/personalSync';

const mocks = vi.hoisted(() => ({
  user: { id: 20, role: 'admin', coachId: null } as { id: number; role: string; coachId: number | null },
  sessions: [] as WorkoutSession[],
  activeSession: null as WorkoutSession | null,
  refreshing: false, storageWarning: null as string | null,
  program: [] as WorkoutTemplate[],
  sync: { phase: 'synced', lastSyncAt: '2026-01-01T00:00:00Z', conflicts: [], message: '' } as PersonalSyncState,
}));
vi.mock('../context/GymProvider', () => ({ useGym: () => ({ sessions: mocks.sessions, loading: false, refreshing: mocks.refreshing, storageWarning: mocks.storageWarning, activeSession: mocks.activeSession }) }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock('../components/PersonalSync', () => ({ usePersonalSyncState: () => mocks.sync }));
vi.mock('../components/CoachConnection', () => ({ CoachConnection: () => null }));
vi.mock('../lib/programStore', () => ({
  useProgram: () => mocks.program,
  getPrimaryWorkoutTemplates: () => mocks.program.filter((workout) => !workout.optional),
  getWorkoutTemplate: (id: string) => mocks.program.find((workout) => workout.id === id),
  useAssignedMeta: () => null, getAssignedMeta: () => null,
  useAssignedProgramLoadState: () => 'ready', isProgramReadOnly: () => false,
}));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: '', subtitle: '' }) }));

import { Dashboard } from './Dashboard';
import { workoutTemplates } from '../data/workouts';

function Location() { return <span data-testid="location">{useLocation().pathname}</span>; }
function renderDashboard() {
  return render(<MemoryRouter><Routes><Route path="/" element={<Dashboard />} /><Route path="/workout/:id" element={<Location />} /></Routes></MemoryRouter>);
}
function session(): WorkoutSession {
  const first = mocks.program[0]!;
  return {
    id: 'session-1', templateId: first.id, templateSnapshot: structuredClone(first), name: first.name,
    status: 'active', startedAt: '2026-10-30T08:00:00Z', notes: '', currentExerciseIndex: 0, currentSetIndex: 0,
    exercises: first.exercises.map((exercise) => ({ exerciseId: exercise.exerciseId, sets: [] })),
  };
}

describe.each(['admin', 'student'])('%s dashboard workout state', (role) => {
  beforeEach(() => {
    mocks.user = { id: 20, role, coachId: role === 'student' ? 4 : null };
    mocks.program = structuredClone(workoutTemplates);
    mocks.sessions = [];
    mocks.activeSession = null; mocks.refreshing = false; mocks.storageWarning = null;
    mocks.sync = { phase: 'synced', lastSyncAt: '2026-10-30T08:00:00Z', conflicts: [], message: '' };
  });
  afterEach(cleanup);

  it('offers start, not resume, before any session exists', async () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: 'شروع تمرین' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ادامهٔ تمرین' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'شروع تمرین' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/workout/${mocks.program[0]!.id}`);
  });

  it('offers start for an untouched session and reopens that same session', async () => {
    const open = session();
    mocks.sessions = [open]; mocks.activeSession = open;
    renderDashboard();
    expect(screen.getByText('هنوز ستی ثبت نشده؛ با شروع، همین جلسه باز می‌شود.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'شروع تمرین' }));
    expect(screen.getByTestId('location')).toHaveTextContent(`/workout/${open.templateId}`);
  });

  it('offers resume when a set or note exists', () => {
    const open = session();
    open.exercises[0]!.sets = [{ setNumber: 1, weightKg: 10, reps: 8, rir: 2, doneAt: '2026-10-30T08:05:00Z' }];
    mocks.sessions = [open]; mocks.activeSession = open;
    renderDashboard();
    expect(screen.getByRole('button', { name: 'ادامهٔ تمرین' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع تمرین' })).not.toBeInTheDocument();
  });

  it('moves to the next workout after a confirmed completion', () => {
    const finished = { ...session(), status: 'completed' as const, completedAt: '2026-10-30T09:00:00Z' };
    mocks.sessions = [finished];
    renderDashboard();
    expect(screen.getByRole('button', { name: 'شروع تمرین' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ادامهٔ تمرین' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: mocks.program[1]!.name })).toBeInTheDocument();
  });
});

describe('dashboard uncertain or multiple sessions', () => {
  beforeEach(() => {
    mocks.user = { id: 20, role: 'admin', coachId: null };
    mocks.program = structuredClone(workoutTemplates);
    mocks.sync = { phase: 'synced', lastSyncAt: '2026-10-30T08:00:00Z', conflicts: [], message: '' };
    mocks.sessions = []; mocks.activeSession = null; mocks.refreshing = false; mocks.storageWarning = null;
  });
  afterEach(cleanup);

  it('does not guess which of two open sessions should be resumed', () => {
    const first = session();
    const second = { ...session(), id: 'session-2' };
    mocks.sessions = [first, second]; mocks.activeSession = first;
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('چند جلسهٔ باز پیدا شد');
    expect(screen.getByRole('link', { name: /بررسی جلسه‌ها/ })).toHaveAttribute('href', `/workout/${first.templateId}`);
    expect(screen.queryByRole('button', { name: /شروع تمرین|ادامهٔ تمرین/ })).not.toBeInTheDocument();
  });

  it('waits for the device view to refresh before showing the session', () => {
    const open = session();
    mocks.sessions = [open]; mocks.activeSession = open; mocks.refreshing = true;
    const view = renderDashboard();
    expect(screen.getByRole('status')).toHaveTextContent('در حال بررسی اطلاعات حساب');
    expect(screen.queryByRole('button', { name: /شروع تمرین|ادامهٔ تمرین/ })).not.toBeInTheDocument();
    mocks.refreshing = false;
    view.rerender(<MemoryRouter><Routes><Route path="/" element={<Dashboard />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'شروع تمرین' })).toBeInTheDocument();
  });

  it('does not label an uncertain local session after a storage failure', () => {
    const open = session();
    mocks.sessions = [open]; mocks.activeSession = open; mocks.storageWarning = 'خطای حافظهٔ دستگاه';
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('وضعیت تمرین در دستگاه نامشخص است');
    expect(screen.queryByRole('button', { name: /شروع تمرین|ادامهٔ تمرین/ })).not.toBeInTheDocument();
  });

  it('asks for sync review instead of showing a potentially stale session', () => {
    const open = session();
    mocks.sessions = [open]; mocks.activeSession = open;
    mocks.sync = { phase: 'error', lastSyncAt: null, conflicts: [], message: 'خطا' };
    renderDashboard();
    expect(screen.getByRole('alert')).toHaveTextContent('بررسی تمرین‌های سرور انجام نشد');
    expect(screen.queryByRole('button', { name: /شروع تمرین|ادامهٔ تمرین/ })).not.toBeInTheDocument();
  });
});
