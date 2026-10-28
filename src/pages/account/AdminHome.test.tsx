import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('./AccountShell', () => ({
  PanelPage: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CredentialsCard: () => null,
}));

import { AdminHome } from './AdminHome';

describe('admin coach list loading recovery', () => {
  beforeEach(() => mocks.api.mockReset());
  afterEach(() => cleanup());

  it('retries the coach list and shows the empty state only after a successful response', async () => {
    let attempts = 0;
    mocks.api.mockImplementation((_method: string, path: string) => path === '/admin/students'
      ? Promise.resolve({ students: [] })
      : ++attempts === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ coaches: [] }));
    render(<MemoryRouter><AdminHome /></MemoryRouter>);

    expect(await screen.findByText('فهرست مربی‌ها بارگذاری نشد.')).toBeInTheDocument();
    expect(screen.queryByText(/هنوز مربی‌ای ساخته نشده/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری فهرست مربی‌ها' }));

    expect(await screen.findByText(/هنوز مربی‌ای ساخته نشده/)).toBeInTheDocument();
    expect(mocks.api.mock.calls.filter((call) => call[1] === '/coaches')).toHaveLength(2);
  });

  it('prioritizes pending coaches and filters direct and manual accounts by name or username', async () => {
    mocks.api.mockImplementation((_method: string, path: string) => path === '/admin/students'
      ? Promise.resolve({ students: [], nextCursor: null })
      : Promise.resolve({ coaches: [
        { id: 2, username: 'manual-coach', displayName: 'مربی دستی', isActive: true, selfRegistered: false, studentCount: 0 },
        { id: 3, username: 'direct-coach', displayName: 'مربی مستقیم', isActive: false, selfRegistered: true, pendingApproval: true, studentCount: 0 },
      ] }));
    render(<MemoryRouter><AdminHome /></MemoryRouter>);
    await screen.findByText('مربی مستقیم');
    const cards = screen.getAllByRole('article');
    expect(cards[0]).toHaveTextContent('مربی مستقیم');
    await userEvent.type(screen.getByLabelText('جست‌وجوی مربی با نام یا نام کاربری'), 'manual-coach');
    expect(screen.getByText('مربی دستی')).toBeInTheDocument();
    expect(screen.queryByText('مربی مستقیم')).not.toBeInTheDocument();
  });
});
