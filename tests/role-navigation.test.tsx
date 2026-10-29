import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

/** Every role gets the whole app; a coach or the admin gets extra sections in the same toolbar. */
function stubUser(role: 'coach' | 'admin') {
  const user = { id: 2, username: 'u1', role, displayName: 'تست', coachId: null, mustChangePassword: false };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ user }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
}

beforeEach(() => {
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('toolbar per role', () => {
  it('a coach lands on a focused roster and sees coach-first navigation', async () => {
    stubUser('coach');
    render(<App />);
    const mobile = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    for (const label of ['شاگردها', 'برنامه‌سازی', 'درآمدها']) {
      expect(within(mobile).getByText(label)).toBeInTheDocument();
    }
    expect(await screen.findByRole('heading', { name: 'شاگردهای من' })).toBeInTheDocument();
  });

  it('the admin lands on personal training and keeps management and finance in More', async () => {
    stubUser('admin');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'مسیر تمرین تو' })).toBeInTheDocument();
    const mobile = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    const bar = mobile.querySelector('.mobile-nav__bar') as HTMLElement;
    for (const label of ['خانه', 'برنامه', 'پیشرفت']) expect(within(bar).getByText(label)).toBeInTheDocument();
    expect(within(bar).queryByText('مالی باشگاه')).not.toBeInTheDocument();
    await userEvent.setup().click(within(bar).getByRole('button', { name: 'سایر بخش‌ها و امکانات' }));
    const sheet = within(mobile).getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    expect(within(sheet).getByRole('link', { name: /مدیریت مربی‌ها و شاگردها/ })).toHaveAttribute('href', '/coach');
    expect(within(sheet).getByRole('link', { name: /مالی باشگاه/ })).toHaveAttribute('href', '/coach/admin/transactions');
    for (const label of ['حرکت‌ها', 'هوش سلامتی', 'تغذیه', 'تنظیمات']) expect(within(sheet).getByText(label)).toBeInTheDocument();
  });
});
