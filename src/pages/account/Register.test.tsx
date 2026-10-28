import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), signIn: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ status: 'signed-out', user: null, signIn: mocks.signIn }) }));
import { Register } from './Register';

function open(path = '/register') {
  return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/register" element={<Register />} /><Route path="/" element={<p>خانهٔ شاگرد</p>} /><Route path="/login" element={<p>ورود</p>} /></Routes></MemoryRouter>);
}
function fill(confirmation = 'chosen-password-123') {
  fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), { target: { value: 'سارا رضایی' } });
  fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: '09123456789' } });
  fireEvent.change(screen.getByLabelText('نام کاربری انگلیسی'), { target: { value: 'sara.fit' } });
  fireEvent.change(screen.getByLabelText('رمز عبور', { exact: true }), { target: { value: 'chosen-password-123' } });
  fireEvent.change(screen.getByLabelText('تکرار رمز عبور'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('checkbox'));
}

beforeEach(() => { mocks.api.mockReset(); mocks.signIn.mockReset(); });
afterEach(cleanup);

describe('direct registration screen', () => {
  it('registers an independent student and signs in with the selected credentials', async () => {
    mocks.api.mockResolvedValue({ username: 'sara.fit', pendingApproval: false });
    mocks.signIn.mockResolvedValue({ id: 4, role: 'student' });
    open(); fill();
    expect(screen.getByText(/پس از ورود می‌توانی با کد دعوت/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت حساب شخصی' }));
    expect(await screen.findByText('خانهٔ شاگرد')).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('POST', '/auth/register', { role: 'student', displayName: 'سارا رضایی', phoneNumber: '09123456789', username: 'sara.fit', password: 'chosen-password-123', dataNoticeAccepted: true });
    expect(mocks.signIn).toHaveBeenCalledWith('sara.fit', 'chosen-password-123');
  });

  it('explains coach approval and does not attempt a login while pending', async () => {
    mocks.api.mockResolvedValue({ username: 'sara.fit', pendingApproval: true });
    open('/register?role=coach'); fill();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت درخواست مربی' }));
    expect(await screen.findByRole('status')).toHaveTextContent('پس از بررسی و تأیید مدیر');
    expect(mocks.api.mock.calls[0]![2]).toMatchObject({ role: 'coach', dataNoticeAccepted: true });
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('shows an already-created account when automatic login fails, without submitting again', async () => {
    mocks.api.mockResolvedValue({ username: 'sara.fit', pendingApproval: false });
    mocks.signIn.mockRejectedValue(new Error('offline'));
    open(); fill();
    fireEvent.click(screen.getByRole('button', { name: 'ساخت حساب شخصی' }));
    expect(await screen.findByRole('status')).toHaveTextContent('نیازی به ثبت‌نام دوباره نیست');
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched password without sending the request', async () => {
    open(); fill('different-password-123');
    fireEvent.click(screen.getByRole('button', { name: 'ساخت حساب شخصی' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('یکسان نیست');
    await waitFor(() => expect(mocks.api).not.toHaveBeenCalled());
  });
});
