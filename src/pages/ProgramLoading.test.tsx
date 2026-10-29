import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAssignedMeta, setAssignedProgram, setAssignedProgramLoadState } from '../lib/programStore';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../context/GymProvider', () => ({ useGym: () => ({ sessions: [], activeSession: null }) }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: { id: 7, role: 'student', coachId: 3, personalProgramMode: false } }) }));
vi.mock('../lib/assignedProgram', () => ({ loadAssignedProgram: mocks.load }));
vi.mock('../components/ProgrammeArchive', () => ({ ProgrammeArchive: () => <div>بایگانی آزمایشی</div> }));
import { Program } from './Program';

beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(undefined);
  setAssignedMeta(null);
  setAssignedProgram([]);
  setAssignedProgramLoadState('loading');
});
afterEach(() => { cleanup(); setAssignedProgramLoadState('idle'); });

describe('programme loading and retry', () => {
  it('never claims that a programme is empty while a coach response is pending', () => {
    render(<MemoryRouter><Program /></MemoryRouter>);
    expect(screen.getByText('در حال دریافت برنامه از مربی…')).toBeInTheDocument();
    expect(screen.queryByText('مربی هنوز برنامه‌ای برای شما ثبت نکرده است.')).not.toBeInTheDocument();
    expect(screen.queryByText('تعریف برنامه جدید')).not.toBeInTheDocument();
  });

  it('offers retry after an error and only shows empty after a successful response', async () => {
    render(<MemoryRouter><Program /></MemoryRouter>);
    act(() => setAssignedProgramLoadState('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('دریافت برنامه انجام نشد');
    expect(screen.getByText('بایگانی آزمایشی')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'تلاش دوباره' }));
    expect(mocks.load).toHaveBeenCalledOnce();
    act(() => setAssignedProgramLoadState('ready'));
    expect(screen.getByText('مربی هنوز برنامه‌ای برای شما ثبت نکرده است.')).toBeInTheDocument();
  });
});
