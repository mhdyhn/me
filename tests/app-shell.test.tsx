import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

beforeEach(async () => {
  // The app sits behind sign-in: pretend a signed-in student session is present.
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  vi.stubGlobal('fetch', async () =>
    new Response(JSON.stringify({ user: { id: 9, username: 's000009', role: 'student', displayName: 'تست', coachId: 1, mustChangePassword: false } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  window.history.replaceState({}, '', '/');
  await db.sessions.clear();
  await db.bodyweights.clear();
  await db.nutritionDays.clear();
  await db.preferences.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('complete application shell', () => {
  it('boots the dashboard through the production router and shared navigation', async () => {
    render(<App />);
    expect(await screen.findByText('هنوز برنامه‌ای از مربی برای شما ثبت نشده است.')).toBeInTheDocument();
    const mobile = screen.getByRole('navigation', { name: 'ناوبری موبایل' });
    expect(mobile).toBeInTheDocument();
    // A student sees the coach's program, not the whole exercise library.
    expect(within(mobile).getByText('برنامه من')).toBeInTheDocument();
    expect(within(mobile).queryByText('حرکت‌ها')).not.toBeInTheDocument();
  });

  it('supports a direct exercise-detail URL without a prior dashboard visit', async () => {
    window.history.replaceState({}, '', '/exercise/barbell-bench-press');
    render(<App />);
    expect(await screen.findByText('پرس سینه با هالتر')).toBeInTheDocument();
    // The written movement timeline has one tab per step; there is no 3D viewer any more.
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });
});
