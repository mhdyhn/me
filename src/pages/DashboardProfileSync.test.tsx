import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  loadAssignedProgram: vi.fn(),
  programLoadState: 'loading' as 'idle' | 'loading' | 'ready' | 'error',
}));

vi.mock('../context/GymProvider', () => ({
  useGym: () => ({ sessions: [], loading: false, activeSession: null }),
}));
vi.mock('../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 27, role: 'student' } }),
}));
vi.mock('../lib/programStore', () => ({
  useProgram: () => [],
  useAssignedProgramLoadState: () => mocks.programLoadState,
  getWorkoutTemplate: () => undefined,
  getPrimaryWorkoutTemplates: () => [],
}));
vi.mock('../lib/assignedProgram', () => ({ loadAssignedProgram: mocks.loadAssignedProgram }));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: 'آزمایش', subtitle: 'متن آزمایشی' }) }));

import { Dashboard } from './Dashboard';

describe('student dashboard program loading', () => {
  beforeEach(() => {
    mocks.programLoadState = 'loading';
    mocks.loadAssignedProgram.mockReset().mockResolvedValue(undefined);
  });

  afterEach(cleanup);

  it('shows a loading state instead of prematurely saying the coach has not assigned a programme', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت برنامه از مربی');
    expect(screen.queryByText('برنامهٔ تمرینی‌ات هنوز آماده نیست')).not.toBeInTheDocument();
    expect(screen.queryByText(/همگام‌سازی پروفایل/)).not.toBeInTheDocument();
    expect(screen.queryByText(/پروفایل با حساب همگام است/)).not.toBeInTheDocument();
  });

  it('offers a retry when the programme request fails', async () => {
    mocks.programLoadState = 'error';
    const user = userEvent.setup();
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByRole('alert')).toHaveTextContent('دریافت برنامه انجام نشد');
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(mocks.loadAssignedProgram).toHaveBeenCalledOnce();
  });

  it('shows the no-program prompt only after the server confirms there is no assigned programme', () => {
    mocks.programLoadState = 'ready';
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByText('برنامهٔ تمرینی‌ات هنوز آماده نیست')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /گفتگو با مربی/ })).toBeInTheDocument();
  });
});
