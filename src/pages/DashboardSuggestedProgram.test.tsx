import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: { id: 20, role: 'student', coachId: null } as { id: number; role: string; coachId: number | null },
  program: [] as unknown[],
}));
vi.mock('../context/GymProvider', () => ({
  useGym: () => ({ sessions: [], loading: false, refreshing: false, storageWarning: null, activeSession: null }),
}));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock('../components/PersonalSync', () => ({ usePersonalSyncState: () => ({ phase: 'synced', lastSyncAt: '2026-01-01T00:00:00Z', conflicts: [], message: '' }) }));
vi.mock('../components/CoachConnection', () => ({ CoachConnection: () => null }));
vi.mock('../lib/programStore', () => ({
  useProgram: () => mocks.program,
  getPrimaryWorkoutTemplates: () => [],
  getWorkoutTemplate: () => undefined,
  useAssignedMeta: () => null,
  getAssignedMeta: () => null,
  useAssignedProgramLoadState: () => 'ready',
  isProgramReadOnly: () => false,
}));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: '', subtitle: '' }) }));

import { Dashboard } from './Dashboard';

describe('the dashboard of an independent student', () => {
  beforeEach(() => {
    mocks.user.role = 'student';
    mocks.user.coachId = null;
    mocks.program = [];
  });
  afterEach(() => cleanup());

  it('offers the suggested programme next to the personal programme', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('برنامهٔ خودت را شروع کن')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ساخت برنامهٔ شخصی/ })).toHaveAttribute('href', '/program');
    expect(screen.getByRole('link', { name: /برنامهٔ پیشنهادی میتی/ })).toHaveAttribute('href', '/program/suggested');
  });

  it('does not offer the suggested programme to a student of a coach', () => {
    mocks.user.coachId = 4;
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('برنامهٔ تمرینی‌ات هنوز آماده نیست')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /برنامهٔ پیشنهادی میتی/ })).not.toBeInTheDocument();
  });
});
