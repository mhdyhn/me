import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../components/ConfirmModal', () => ({ confirmModal: mocks.confirm }));

import { OwnerProfileCopies } from './OwnerProfileCopies';

const copy = { userId: 9, username: 'student.one', displayName: 'شاگرد یک', role: 'student' };

beforeEach(() => {
  mocks.api.mockReset();
  mocks.confirm.mockReset();
});
afterEach(cleanup);

describe('owner profile copies in the admin panel', () => {
  it('checks the accounts only when the owner asks for it', async () => {
    render(<OwnerProfileCopies />);
    expect(mocks.api).not.toHaveBeenCalled();
    mocks.api.mockResolvedValue({ accounts: [copy] });
    fireEvent.click(screen.getByRole('button', { name: /بررسی نسخه‌های تکراری/ }));
    expect(await screen.findByText('student.one')).toBeInTheDocument();
    expect(screen.getByText('شاگرد یک')).toBeInTheDocument();
  });

  it('says nothing is wrong when no copy exists', async () => {
    mocks.api.mockResolvedValue({ accounts: [] });
    render(<OwnerProfileCopies />);
    fireEvent.click(screen.getByRole('button', { name: /بررسی نسخه‌های تکراری/ }));
    expect(await screen.findByText(/هیچ نسخهٔ تکراری/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /پاک‌کردن نسخه‌های تکراری/ })).not.toBeInTheDocument();
  });

  it('removes the copies only after an explicit confirmation', async () => {
    mocks.api.mockResolvedValueOnce({ accounts: [copy] }).mockResolvedValueOnce({ removed: [copy] });
    mocks.confirm.mockResolvedValue(true);
    render(<OwnerProfileCopies />);
    fireEvent.click(screen.getByRole('button', { name: /بررسی نسخه‌های تکراری/ }));
    await screen.findByText('student.one');
    fireEvent.click(screen.getByRole('button', { name: /پاک‌کردن نسخه‌های تکراری/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/admin/owner-profile-copies', {}));
    expect(await screen.findByText(/پروفایل تو از ۱ حساب پاک شد/)).toBeInTheDocument();
  });

  it('keeps the copies when the owner does not confirm', async () => {
    mocks.api.mockResolvedValue({ accounts: [copy] });
    mocks.confirm.mockResolvedValue(false);
    render(<OwnerProfileCopies />);
    fireEvent.click(screen.getByRole('button', { name: /بررسی نسخه‌های تکراری/ }));
    await screen.findByText('student.one');
    fireEvent.click(screen.getByRole('button', { name: /پاک‌کردن نسخه‌های تکراری/ }));
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(screen.getByText('student.one')).toBeInTheDocument();
  });
});
