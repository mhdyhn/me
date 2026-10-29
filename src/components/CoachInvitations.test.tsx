import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('./ConfirmModal', () => ({ confirmModal: mocks.confirm }));
import { CoachInvitations } from './CoachInvitations';

beforeEach(() => { mocks.api.mockReset(); mocks.confirm.mockReset(); });
afterEach(cleanup);

describe('coach invitation controls', () => {
  it('creates and displays a one-use invitation and can revoke unused codes', async () => {
    const code = 'X'.repeat(32);
    mocks.api.mockResolvedValueOnce({ code, expiresAt: '2026-11-01T00:00:00Z' }).mockResolvedValueOnce({ ok: true });
    mocks.confirm.mockResolvedValue(true);
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('دعوت شاگرد با حساب خودش'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت کد دعوت' }));
    expect(await screen.findByText(code)).toBeInTheDocument();
    expect(screen.getByText(/یک‌بارمصرف است/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'باطل‌کردن کدهای استفاده‌نشده' }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('DELETE', '/coach/invitations', {}));
    expect(await screen.findByRole('status')).toHaveTextContent('باطل شدند');
    expect(screen.queryByText(code)).not.toBeInTheDocument();
  });
  it('creates QR locally only on request and removes it when a new code is issued', async () => {
    const first = 'a'.repeat(32);
    const second = 'b'.repeat(32);
    mocks.api.mockResolvedValueOnce({ code: first, expiresAt: '2026-11-01T00:00:00Z' })
      .mockResolvedValueOnce({ code: second, expiresAt: '2026-11-01T01:00:00Z' });
    render(<CoachInvitations />);
    fireEvent.click(screen.getByText('دعوت شاگرد با حساب خودش'));
    fireEvent.click(screen.getByRole('button', { name: 'ساخت کد دعوت' }));
    await screen.findByText(first);
    expect(screen.queryByRole('img', { name: /QR دعوت/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمایش QR' }));
    const image = await screen.findByRole('img', { name: /QR دعوت/ });
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText(/اتصال فقط پس از بررسی نام مربی و رضایت شاگرد/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت کد دعوت' }));
    await screen.findByText(second);
    expect(screen.queryByRole('img', { name: /QR دعوت/ })).not.toBeInTheDocument();
    expect(screen.queryByText(first)).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

});
