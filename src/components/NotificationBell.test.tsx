import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});
import { NotificationBell } from './NotificationBell';

const items = [
  { id: 1, kind: 'payment', title: 'برنامه قفل شد؛ رسید واریز را ثبت کنید', body: 'مبلغ ۹۹٬۹۹۹ تومان', link: '/pay/receipt', createdAt: new Date().toISOString(), readAt: null },
  { id: 2, kind: 'system', title: 'خوش آمدید', body: '', link: null, createdAt: new Date().toISOString(), readAt: '2026-10-30T08:00:00.000Z' },
];

beforeEach(() => { mocks.api.mockReset(); mocks.navigate.mockReset(); });
afterEach(cleanup);

describe('the notification bell', () => {
  it('shows the unread count, opens the list and marks a notification as read', async () => {
    mocks.api.mockResolvedValueOnce({ notifications: items, unread: 1 })
      .mockResolvedValueOnce({ ok: true });
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('GET', '/notifications?limit=15'));
    const button = await screen.findByRole('button', { name: '۱ اعلان خوانده‌نشده' });
    fireEvent.click(button);
    expect(await screen.findByText('برنامه قفل شد؛ رسید واریز را ثبت کنید')).toBeInTheDocument();
    fireEvent.click(screen.getByText('برنامه قفل شد؛ رسید واریز را ثبت کنید'));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/notifications/read', { ids: [1] }));
    expect(mocks.navigate).toHaveBeenCalledWith('/pay/receipt');
  });

  it('keeps the app alive when the list cannot be loaded', async () => {
    mocks.api.mockRejectedValue(new Error('offline'));
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    await waitFor(() => expect(mocks.api).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'اعلان‌ها' })).toBeInTheDocument();
  });
});
