import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ coaches: [] });
    render(<MemoryRouter><AdminHome /></MemoryRouter>);

    expect(await screen.findByText('فهرست مربی‌ها بارگذاری نشد.')).toBeInTheDocument();
    expect(screen.queryByText(/هنوز مربی‌ای ساخته نشده/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری فهرست مربی‌ها' }));

    expect(await screen.findByText(/هنوز مربی‌ای ساخته نشده/)).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
