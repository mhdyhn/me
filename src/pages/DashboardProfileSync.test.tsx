import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  loadAssignedProgram: vi.fn(),
  programLoadState: 'loading' as 'idle' | 'loading' | 'ready' | 'error',
  assignedMeta: null as null | { priceTomans: number; isPaid: boolean; isTestPurchase: boolean },
  activeSession: null as null | { templateId: string; name: string; exercises: never[] },
}));

vi.mock('../context/GymProvider', () => ({
  useGym: () => ({ sessions: [], loading: false, activeSession: mocks.activeSession }),
}));
vi.mock('../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 27, role: 'student' } }),
}));
vi.mock('../lib/programStore', () => ({
  useProgram: () => [],
  useAssignedMeta: () => mocks.assignedMeta,
  useAssignedProgramLoadState: () => mocks.programLoadState,
  getWorkoutTemplate: () => undefined,
  isProgramReadOnly: () => false,
  getPrimaryWorkoutTemplates: () => [],
}));
vi.mock('../lib/assignedProgram', () => ({ loadAssignedProgram: mocks.loadAssignedProgram }));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: 'آزمایش', subtitle: 'متن آزمایشی' }) }));

import { Dashboard } from './Dashboard';

describe('student dashboard program loading', () => {
  beforeEach(() => {
    mocks.programLoadState = 'loading';
    mocks.assignedMeta = null;
    mocks.activeSession = null;
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

  it('does not invent zero exercises or duration for a legacy session without its prescription', () => {
    mocks.programLoadState = 'ready';
    mocks.activeSession = { templateId: 'old-day', name: 'جلسهٔ قدیمی', exercises: [] };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByText('برنامهٔ اصلی جلسه در دسترس نیست؛ وضعیت جلسه و ست‌های ثبت‌شده را بررسی کن.')).toBeInTheDocument();
    expect(screen.queryByText('۰ حرکت')).not.toBeInTheDocument();
    expect(screen.queryByText(/حدود ۰ دقیقه/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ادامهٔ تمرین/ })).toBeInTheDocument();
  });

  it('does not describe a locked paid programme as missing', () => {
    mocks.programLoadState = 'ready';
    mocks.assignedMeta = { priceTomans: 100000, isPaid: false, isTestPurchase: false };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByText('برنامهٔ مربی آماده است')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /بررسی برنامه/ })).toHaveAttribute('href', '/program');
    expect(screen.queryByText('برنامهٔ تمرینی‌ات هنوز آماده نیست')).not.toBeInTheDocument();
  });

  it('shows the no-program prompt only after the server confirms there is no assigned programme', () => {
    mocks.programLoadState = 'ready';
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByText('برنامهٔ تمرینی‌ات هنوز آماده نیست')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /گفتگو با مربی/ })).toBeInTheDocument();
  });
});
