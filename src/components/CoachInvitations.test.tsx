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
});
