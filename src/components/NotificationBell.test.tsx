import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});
import { NotificationBell, panelBoxFor } from './NotificationBell';

const items = [
  { id: 1, kind: 'payment', title: 'برنامه قفل شد؛ رسید واریز را ثبت کنید', body: 'مبلغ ۹۹٬۹۹۹ تومان', link: '/pay/receipt', createdAt: new Date().toISOString(), readAt: null },
  { id: 2, kind: 'system', title: 'خوش آمدید', body: '', link: null, createdAt: new Date().toISOString(), readAt: '2026-10-30T08:00:00.000Z' },
];

beforeEach(() => { mocks.api.mockReset(); mocks.navigate.mockReset(); });
afterEach(cleanup);

/** The screen of a phone, so the panel has to fit into a narrow viewport. */
function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

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

  it('opens the list as a dialog that stays inside the screen', async () => {
    mocks.api.mockResolvedValueOnce({ notifications: items, unread: 1 });
    render(<MemoryRouter><NotificationBell /></MemoryRouter>);
    const button = await screen.findByRole('button', { name: '۱ اعلان خوانده‌نشده' });
    fireEvent.click(button);
    const panel = await screen.findByRole('dialog', { name: 'اعلان‌ها' });
    expect(panel).toBeInTheDocument();
    // The panel is placed against the screen, not inside the header, so it cannot be clipped.
    expect(panel.closest('.notification-bell')).toBeNull();
  });
});

describe('the place of the notification panel', () => {
  it('keeps the panel inside a narrow phone screen', () => {
    setViewport(360, 640);
    // The bell sits in the middle of the header row of the phone.
    const box = panelBoxFor({ top: 12, bottom: 50, left: 150, right: 188 });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(360);
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(640);
  });

  it('keeps the panel inside the screen when the bell is at the very edge', () => {
    setViewport(320, 568);
    const box = panelBoxFor({ top: 8, bottom: 46, left: 0, right: 38 });
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.width).toBeLessThanOrEqual(320);
  });

  it('hangs the panel under the button and never past the bottom', () => {
    setViewport(1280, 900);
    const box = panelBoxFor({ top: 20, bottom: 58, left: 1200, right: 1238 });
    expect(box.top).toBe(66);
    expect(box.left + box.width).toBeLessThanOrEqual(1280);
    expect(box.maxHeight).toBeLessThanOrEqual(Math.round(900 * 0.6));
  });
});
