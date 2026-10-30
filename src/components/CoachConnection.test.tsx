import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), setUser: vi.fn(), refresh: vi.fn(), confirm: vi.fn(), user: null as null | Record<string, unknown>, activeSession: null as null | Record<string, unknown>, loading: false }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 400; } }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user, setUser: mocks.setUser, refresh: mocks.refresh }) }));
vi.mock('../context/GymProvider', () => ({ useGym: () => ({ activeSession: mocks.activeSession, loading: mocks.loading }) }));
vi.mock('./ConfirmModal', () => ({ confirmModal: mocks.confirm }));
import { CoachConnection } from './CoachConnection';

const independent = { id: 17, username: 'student', role: 'student', coachId: null, selfRegistered: true, coachAccess: true, mustChangePassword: false };
const code = 'a'.repeat(32);
beforeEach(() => {
  mocks.api.mockReset(); mocks.setUser.mockReset(); mocks.refresh.mockReset(); mocks.confirm.mockReset();
  mocks.user = independent; mocks.activeSession = null; mocks.loading = false;
});
afterEach(cleanup);

describe('coach connection controls', () => {
  it('shows the coach and privacy limitations before accepting, with explicit consent', async () => {
    const connected = { ...independent, coachId: 12 };
    mocks.api.mockResolvedValueOnce({ coachName: 'مربی سارا', expiresAt: '2026-11-01T00:00:00Z' }).mockResolvedValueOnce({ user: connected });
    render(<CoachConnection />);
    fireEvent.change(screen.getByLabelText('کد دعوت مربی'), { target: { value: code } });
    fireEvent.click(screen.getByRole('button', { name: 'بررسی کد' }));
    expect(await screen.findByText('اتصال به مربی سارا')).toBeInTheDocument();
    expect(screen.getByText(/دفتر خوراک و امکانات مدیریت برنامه/)).toBeInTheDocument();
    expect(screen.getByText(/برنامهٔ غذایی، تنظیمات پایش و گفتگوهای مربی قبلی/)).toBeInTheDocument();
    const accept = screen.getByRole('button', { name: 'تأیید اتصال به مربی' });
    expect(accept).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(accept);
    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(connected));
    expect(mocks.api).toHaveBeenCalledWith('POST', '/me/coach-invitation/accept', { accountId: 17, code, consent: true });
  });

  it('does not allow connection while a workout is active or account data is loading', () => {
    mocks.activeSession = { id: 'active' };
    const view = render(<CoachConnection />);
    expect(screen.getByText(/پیش از اتصال یا تغییر برنامه، تمرین در حال انجام را تمام کن/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بررسی کد' })).toBeDisabled();
    mocks.activeSession = null; mocks.loading = true; view.rerender(<CoachConnection />);
    expect(screen.getByRole('button', { name: 'بررسی کد' })).toBeDisabled();
  });

  it('requires a confirmation to withdraw and keeps the account response', async () => {
    mocks.user = { ...independent, coachId: 12 };
    mocks.confirm.mockResolvedValue(true);
    const revoked = { ...mocks.user, coachAccess: false };
    mocks.api.mockResolvedValue({ user: revoked });
    render(<CoachConnection />);
    fireEvent.click(screen.getByRole('button', { name: 'قطع دسترسی مربی' }));
    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(revoked));
    expect(mocks.confirm.mock.calls[0]![0].message).toContain('درخواست‌هایی که پیش از قطع شروع شده‌اند ممکن است کامل شوند');
    expect(mocks.api).toHaveBeenCalledWith('POST', '/me/coach-access/withdraw', { accountId: 17 });
  });

  it('returns to the personal programme only after confirmation and blocks active workouts', async () => {
    mocks.user = { ...independent, coachId: 12, coachAccess: false };
    mocks.activeSession = { id: 'active' };
    const view = render(<CoachConnection />);
    expect(screen.getByRole('button', { name: 'بازگشت به برنامهٔ شخصی' })).toBeDisabled();
    mocks.activeSession = null; view.rerender(<CoachConnection />);
    mocks.confirm.mockResolvedValue(true);
    const personal = { ...mocks.user, personalProgramMode: true };
    mocks.api.mockResolvedValue({ user: personal });
    fireEvent.click(screen.getByRole('button', { name: 'بازگشت به برنامهٔ شخصی' }));
    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(personal));
    expect(mocks.api).toHaveBeenCalledWith('POST', '/me/personal-program/activate', { accountId: 17 });
    expect(mocks.confirm.mock.calls[0]![0].message).toContain('خرید آزمایشی');
  });

  it('lets a manually provisioned student withdraw and explains reconnection is limited to the same coach', async () => {
    mocks.user = { ...independent, selfRegistered: false, coachId: 12 };
    mocks.confirm.mockResolvedValue(true);
    const revoked = { ...mocks.user, coachAccess: false };
    mocks.api.mockResolvedValue({ user: revoked });
    const view = render(<CoachConnection />);
    fireEvent.click(screen.getByRole('button', { name: 'قطع دسترسی مربی' }));
    await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(revoked));
    mocks.user = revoked; view.rerender(<CoachConnection />);
    expect(screen.getByText(/با کد تازه فقط به همان مربی دوباره متصل می‌شود/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'بازگشت به برنامهٔ شخصی' })).toBeInTheDocument();
  });
});
