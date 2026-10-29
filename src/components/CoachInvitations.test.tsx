import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, getToken: () => 'coach-token', getStoredUser: () => ({ id: 4 }), ApiError: class ApiError extends Error {} }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: { id: 4, role: 'coach' } }) }));
vi.mock('./ConfirmModal', () => ({ confirmModal: mocks.confirm }));
import { CoachInvitations } from './CoachInvitations';

beforeEach(() => { mocks.api.mockReset(); mocks.confirm.mockReset(); });
afterEach(cleanup);

describe('coach registration link', () => {
  it('creates a reusable link without showing a long code and revokes it only after confirmation', async () => {
    const token = 'X'.repeat(43);
    mocks.api.mockResolvedValueOnce({ token }).mockResolvedValueOnce({ ok: true });
    mocks.confirm.mockResolvedValue(true);
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('لینک ثبت‌نام شاگرد'));
    fireEvent.click(screen.getByRole('button', { name: 'دریافت لینک ثبت‌نام' }));
    expect(await screen.findByText('لینک آمادهٔ ارسال است.')).toBeInTheDocument();
    expect(screen.queryByText(token)).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('POST', '/coach/registration-link', { accountId: 4 });
    expect(screen.getByText(/برای چند شاگرد قابل استفاده است/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال‌کردن لینک' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('DELETE', '/coach/registration-link', { accountId: 4 }));
    expect(await screen.findByRole('status')).toHaveTextContent('غیرفعال شد');
    expect(screen.queryByText('لینک آمادهٔ ارسال است.')).not.toBeInTheDocument();
  });
  it('creates a QR locally only on request and exposes a selectable link if clipboard fails', async () => {
    const token = 'a'.repeat(43);
    mocks.api.mockResolvedValueOnce({ token });
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('لینک ثبت‌نام شاگرد'));
    fireEvent.click(screen.getByRole('button', { name: 'دریافت لینک ثبت‌نام' }));
    await screen.findByText('لینک آمادهٔ ارسال است.');
    fireEvent.click(screen.getByRole('button', { name: 'نمایش QR' }));
    const image = await screen.findByRole('img', { name: /QR لینک ثبت‌نام/ });
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    fireEvent.click(screen.getByRole('button', { name: 'کپی لینک' }));
    expect(await screen.findByText(`http://localhost:3000/invite#${token}`)).toBeInTheDocument();
  });
  it('does not report that a link was revoked when the response is incomplete', async () => {
    mocks.api.mockResolvedValueOnce({ token: 'Y'.repeat(43) }).mockResolvedValueOnce({});
    mocks.confirm.mockResolvedValue(true);
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('لینک ثبت‌نام شاگرد'));
    fireEvent.click(screen.getByRole('button', { name: 'دریافت لینک ثبت‌نام' }));
    await screen.findByText('لینک آمادهٔ ارسال است.');
    fireEvent.click(screen.getByRole('button', { name: 'غیرفعال‌کردن لینک' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('نتیجهٔ غیرفعال‌کردن تأیید نشد');
    expect(screen.getByText('لینک آمادهٔ ارسال است.')).toBeInTheDocument();
    expect(screen.queryByText('لینک غیرفعال شد.')).not.toBeInTheDocument();
  });

  it('keeps creating the older one-use codes available without exposing them by default', async () => {
    mocks.api.mockResolvedValueOnce({ code: 'Z'.repeat(32), expiresAt: '2026-11-01T12:00:00.000Z' });
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('لینک ثبت‌نام شاگرد'));
    expect(screen.queryByText('Z'.repeat(32))).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('کدهای یک‌بارمصرف'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت کد یک‌بارمصرف' }));
    expect(await screen.findByText('Z'.repeat(32))).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('POST', '/coach/invitations', { accountId: 4 });
  });

});
