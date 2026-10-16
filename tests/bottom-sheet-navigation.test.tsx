import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

function stubSession(user: { id: number; username: string; role: 'student' | 'coach' | 'admin'; displayName: string; coachId: number | null; mustChangePassword: boolean }) {
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(async () => {
  window.history.replaceState({}, '', '/');
  await db.sessions.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Mobile Bottom Sheet Toolbar Navigation', () => {
  it('displays exactly 5 main tabs on the fixed mobile navigation bar', async () => {
    stubSession({ id: 10, username: 's10', role: 'student', displayName: 'علی', coachId: 1, mustChangePassword: false });
    render(<App />);

    const mobileNav = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    const navBar = mobileNav.querySelector('.mobile-nav__bar');
    expect(navBar).toBeInTheDocument();

    const barItems = within(navBar as HTMLElement).getAllByRole('link');
    expect(barItems).toHaveLength(4);
    expect(within(navBar as HTMLElement).getByText('خانه')).toBeInTheDocument();
    expect(within(navBar as HTMLElement).getByText('برنامه')).toBeInTheDocument();
    expect(within(navBar as HTMLElement).getByText('حرکت‌ها')).toBeInTheDocument();
    expect(within(navBar as HTMLElement).getByText('پیشرفت')).toBeInTheDocument();

    const moreButton = within(navBar as HTMLElement).getByRole('button', { name: /سایر بخش‌ها و امکانات|بیشتر/ });
    expect(moreButton).toBeInTheDocument();
    expect(within(moreButton).getByText('بیشتر')).toBeInTheDocument();
  });

  it('opens and closes the Bottom Sheet when clicking "بیشتر" and the close button', async () => {
    stubSession({ id: 10, username: 's10', role: 'student', displayName: 'علی', coachId: 1, mustChangePassword: false });
    render(<App />);
    const user = userEvent.setup();

    const moreButton = await screen.findByRole('button', { name: /سایر بخش‌ها و امکانات|بیشتر/ });
    const sheet = screen.getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });

    expect(sheet).not.toHaveClass('is-open');

    // Click "بیشتر"
    await user.click(moreButton);
    expect(sheet).toHaveClass('is-open');
    expect(within(sheet).getByText('هوش سلامتی')).toBeInTheDocument();
    expect(within(sheet).getByText('تغذیه')).toBeInTheDocument();
    expect(within(sheet).getByText('مربی')).toBeInTheDocument();

    // Click close button
    const closeBtn = within(sheet).getByRole('button', { name: 'بستن منو' });
    await user.click(closeBtn);
    expect(sheet).not.toHaveClass('is-open');
  });

  it('displays coach-specific panel sections in the Bottom Sheet when user is coach', async () => {
    stubSession({ id: 2, username: 'c2', role: 'coach', displayName: 'مربی رضا', coachId: null, mustChangePassword: false });
    render(<App />);
    const user = userEvent.setup();

    const moreButton = await screen.findByRole('button', { name: /سایر بخش‌ها و امکانات|بیشتر/ });
    await user.click(moreButton);

    const sheet = screen.getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    expect(within(sheet).getByText('پنل مربیگری')).toBeInTheDocument();
    expect(within(sheet).getByText('شاگرد')).toBeInTheDocument();
    expect(within(sheet).getByText('افزودن برنامه')).toBeInTheDocument();
    expect(within(sheet).getByText('درآمدها')).toBeInTheDocument();
    expect(within(sheet).getByText('مدیر')).toBeInTheDocument();
  });
});
