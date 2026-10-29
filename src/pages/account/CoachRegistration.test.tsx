import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), setUser: vi.fn(), refresh: vi.fn(), session: {} as Record<string, unknown>, gym: { activeSession: null as unknown, loading: false } }));
vi.mock('../../lib/api', () => ({ api: mocks.api, getToken: () => 'same-token', getStoredUser: () => ({ id: 8 }), ApiError: class ApiError extends Error { status = 0; } }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ ...mocks.session, setUser: mocks.setUser, refresh: mocks.refresh }) }));
vi.mock('../../context/GymProvider', () => ({ useGym: () => mocks.gym }));
import { CoachRegistration } from './CoachRegistration';
const token = 'A'.repeat(43);
const student = { id: 8, username: 'student8', role: 'student', displayName: 'شاگرد', selfRegistered: true, coachId: null, coachAccess: true, mustChangePassword: false };
function StateProbe() { return <span data-testid="state">{JSON.stringify(useLocation().state)}</span>; }
function show(path = `/invite#${token}`) { render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/invite" element={<CoachRegistration />} /><Route path="/register" element={<StateProbe />} /></Routes></MemoryRouter>); }
beforeEach(() => { sessionStorage.clear(); mocks.api.mockReset().mockResolvedValue({ coachId: 4, coachName: 'مربی سارا' }); mocks.setUser.mockReset(); mocks.refresh.mockReset().mockResolvedValue(undefined); mocks.session = { status: 'signed-out', user: null }; mocks.gym = { activeSession: null, loading: false }; });
afterEach(cleanup);

it('previews the coach and carries the token to registration without attaching', async () => {
  show();
  expect(await screen.findByText(/مربی سارا/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: 'ثبت‌نام شاگرد' }));
  expect(screen.getByTestId('state')).toHaveTextContent(token);
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it('requires explicit consent and blocks an active workout before accepting', async () => {
  mocks.session = { status: 'signed-in', user: student };
  mocks.gym.activeSession = { id: 'active' };
  show();
  await screen.findByText(/مربی سارا/);
  fireEvent.click(screen.getByRole('checkbox'));
  expect(screen.getByRole('button', { name: /تأیید و اتصال/ })).toBeDisabled();
  expect(mocks.api).toHaveBeenCalledTimes(1);
});
it('accepts only a verified response for the same account and coach', async () => {
  mocks.session = { status: 'signed-in', user: student };
  mocks.api.mockResolvedValueOnce({ coachId: 4, coachName: 'مربی سارا' }).mockResolvedValueOnce({ user: { ...student, coachId: 4, coachAccess: true } });
  show(); await screen.findByText(/مربی سارا/); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /تأیید و اتصال/ }));
  await waitFor(() => expect(mocks.setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 8, coachId: 4 })));
  expect(sessionStorage.getItem('meety:coach-registration-link')).toBeNull();
});
it('never substitutes an older invitation when a malformed fragment was opened', async () => {
  sessionStorage.setItem('meety:coach-registration-link', token);
  show('/invite#broken');
  expect(await screen.findByText(/لینک دعوت پیدا نشد یا معتبر نیست/)).toBeInTheDocument();
  expect(mocks.api).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('meety:coach-registration-link')).toBeNull();
});

it('does not replace the session with an incomplete connection response', async () => {
  mocks.session = { status: 'signed-in', user: student };
  mocks.api.mockResolvedValueOnce({ coachId: 4, coachName: 'مربی سارا' }).mockResolvedValueOnce({ user: { id: 8, coachId: 4, coachAccess: true } });
  show(); await screen.findByText(/مربی سارا/); fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /تأیید و اتصال/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('نتیجهٔ اتصال تأیید نشد');
  expect(mocks.setUser).not.toHaveBeenCalled();
  expect(mocks.refresh).toHaveBeenCalled();
});
