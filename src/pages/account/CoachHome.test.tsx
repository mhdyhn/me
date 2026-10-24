import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ user: { id: 1, role: 'coach' } }) }));
vi.mock('./AccountShell', () => ({
  PanelPage: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CredentialsCard: () => null,
}));

import { CoachHome } from './CoachHome';

const students = [
  { id: 21, username: 'sara.fit', role: 'student', displayName: 'سارا رضایی', coachId: 1, mustChangePassword: false, isActive: true, password: null },
  { id: 22, username: 'ali.gh', role: 'student', displayName: 'علی احمدی', coachId: 1, mustChangePassword: false, isActive: false, password: null },
];

describe('coach student list filters', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockResolvedValue({ students });
  });
  afterEach(() => cleanup());

  it('retries loading the student list after a network error', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ students });
    render(<MemoryRouter><CoachHome /></MemoryRouter>);

    expect(await screen.findByText('فهرست شاگردها بارگذاری نشد.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری شاگردها' }));
    expect(await screen.findByText('سارا رضایی')).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });

  it('searches name and username, filters account status, and clears filters', async () => {
    render(<MemoryRouter><CoachHome /></MemoryRouter>);
    expect(await screen.findByText('سارا رضایی')).toBeInTheDocument();
    expect(screen.getByText('علی احمدی')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('جست‌وجوی نام یا نام کاربری'), { target: { value: 'ALI.GH' } });
    expect(screen.getByText('علی احمدی')).toBeInTheDocument();
    expect(screen.queryByText('سارا رضایی')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'وضعیت حساب' }), { target: { value: 'active' } });
    expect(screen.getByText('شاگردی با این جست‌وجو و فیلتر پیدا نشد.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'پاک‌کردن فیلترها' }));
    expect(screen.getByText('سارا رضایی')).toBeInTheDocument();
    expect(screen.getByText('علی احمدی')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'وضعیت حساب' }), { target: { value: 'inactive' } });
    expect(screen.getByText('علی احمدی')).toBeInTheDocument();
    expect(screen.queryByText('سارا رضایی')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('۱ از ۲');
  });
});
