import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

function stubSession(user: { id: number; username: string; role: 'student' | 'coach' | 'admin'; displayName: string; coachId: number | null; mustChangePassword: boolean }) {
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(String(input).includes('/api/me/program') ? { program: null, isPaid: true } : { user }), {
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
  it('keeps the student mobile navigation focused on home, program, and progress', async () => {
    stubSession({ id: 10, username: 's10', role: 'student', displayName: 'علی', coachId: 1, mustChangePassword: false });
    render(<App />);

    const mobileNav = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    const navBar = mobileNav.querySelector('.mobile-nav__bar');
    expect(navBar).toBeInTheDocument();

    const barItems = within(navBar as HTMLElement).getAllByRole('link');
    expect(barItems).toHaveLength(3);
    expect(within(navBar as HTMLElement).getByText('خانه')).toBeInTheDocument();
    expect(within(navBar as HTMLElement).getByText('برنامه')).toBeInTheDocument();
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
    expect(screen.queryByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' })).not.toBeInTheDocument();

    // Click "بیشتر"
    await user.click(moreButton);
    const sheet = screen.getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    expect(sheet).toHaveClass('is-open');
    expect(within(sheet).getByRole('button', { name: 'بستن منو' })).toHaveFocus();
    expect(within(sheet).getByText('هوش سلامتی')).toBeInTheDocument();
    expect(within(sheet).getByText('تغذیه')).toBeInTheDocument();
    expect(within(sheet).getByText('مربی')).toBeInTheDocument();

    // Click close button
    const closeBtn = within(sheet).getByRole('button', { name: 'بستن منو' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' })).not.toBeInTheDocument();
    expect(moreButton).toHaveFocus();
  });

  it('keeps coach work in the main bar and leaves only secondary links in More', async () => {
    stubSession({ id: 2, username: 'c2', role: 'coach', displayName: 'مربی رضا', coachId: null, mustChangePassword: false });
    render(<App />);
    const user = userEvent.setup();

    const mobileNav = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    const navBar = mobileNav.querySelector('.mobile-nav__bar') as HTMLElement;
    for (const label of ['شاگردها', 'برنامه‌سازی', 'درآمدها']) {
      expect(within(navBar).getByText(label)).toBeInTheDocument();
    }
    const moreButton = within(navBar).getByRole('button', { name: /سایر بخش‌ها و امکانات|بیشتر/ });
    await user.click(moreButton);

    const sheet = screen.getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    expect(within(sheet).getByText('امکانات مربی')).toBeInTheDocument();
    expect(within(sheet).getByText('گفتگو با مدیر')).toBeInTheDocument();
    expect(within(sheet).getByText('برنامهٔ شخصی')).toBeInTheDocument();
  });
});
