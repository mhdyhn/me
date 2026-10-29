import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { db } from '../src/lib/db';

beforeEach(async () => {
  // The app sits behind sign-in: pretend a signed-in student session is present.
  window.localStorage.setItem('meety.session-token', 'test-session-token-000000000000');
  vi.stubGlobal('fetch', async (input: string) => {
    const body = input.includes('/api/me/program')
      ? { isPaid: true, program: { id: 'test-offer', version: 1, title: 'برنامهٔ تست', updatedAt: '2026-10-01T00:00:00Z', days: [{ name: 'روز اول', exercises: [{ exerciseId: 'barbell-bench-press', name: 'پرس سینه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }] }, coachName: 'مربی' }
      : { user: { id: 9, username: 's000009', role: 'student', displayName: 'تست', coachId: 1, mustChangePassword: false } };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
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
    expect(await screen.findByText('جلسهٔ بعدی')).toBeInTheDocument();
    const mobile = screen.getByRole('navigation', { name: 'ناوبری موبایل' });
    expect(mobile).toBeInTheDocument();
    // The fixed bar is reserved for the student's core tasks; the movement library remains under More.
    expect(within(mobile).getByText('برنامه')).toBeInTheDocument();
    expect(within(mobile).queryByText('حرکت‌ها')).not.toBeInTheDocument();
    await userEvent.setup().click(within(mobile).getByRole('button', { name: 'سایر بخش‌ها و امکانات' }));
    const sheet = within(mobile).getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    expect(within(sheet).getByText('حرکت‌ها')).toBeInTheDocument();
    expect(within(mobile).queryByText('شاگرد')).not.toBeInTheDocument();
  });

  it('shows the coach-assigned workout without requesting profile synchronization', async () => {
    let profileRequestMade = false;
    const program = {
      id: 'test-offer', version: 1, title: 'برنامهٔ تمرینی شاگرد',
      updatedAt: '2026-10-01T00:00:00Z',
      days: [{ name: 'روز پایین‌تنه', exercises: [{ exerciseId: 'barbell-squat', name: 'اسکوات با هالتر', muscle: 'پا', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    };
    vi.stubGlobal('fetch', async (input: string) => {
      if (input.includes('/api/me/program')) {
        return new Response(JSON.stringify({ program, coachName: 'مربی', isPaid: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (input.includes('/api/me/profile')) {
        profileRequestMade = true;
        return new Promise<Response>(() => {});
      }
      return new Response(JSON.stringify({ user: { id: 9, username: 's000009', role: 'student', displayName: 'تست', coachId: 1, mustChangePassword: false } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    render(<App />);
    expect(await screen.findByText('جلسهٔ بعدی')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'روز پایین‌تنه' })).toBeInTheDocument();
    expect(screen.getByText('۱ حرکت')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'پیشرفت تمرین هفتگی' })).toBeInTheDocument();
    expect(screen.getByText('این هفته')).toBeInTheDocument();
    expect(screen.queryByText(/پروفایل با حساب همگام است/)).not.toBeInTheDocument();
    expect(profileRequestMade).toBe(false);
  });

  it('supports a direct exercise-detail URL without a prior dashboard visit', async () => {
    // A student may open a movement only when it is in the coach's program.
    vi.stubGlobal('fetch', async (input: string) => {
      const program = { id: 'test-offer', version: 1, title: 'برنامه', updatedAt: '2026-10-01T00:00:00Z', days: [{ name: 'روز ۱', exercises: [{ exerciseId: 'barbell-bench-press', name: 'پرس سینه با هالتر', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }] };
      const body = String(input).includes('/me/program') ? { program, coachName: 'مربی', isPaid: true } : { user: { id: 9, username: 's000009', role: 'student', displayName: 'تست', coachId: 1, mustChangePassword: false } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    window.history.replaceState({}, '', '/exercise/barbell-bench-press');
    render(<App />);
    expect(await screen.findByText('پرس سینه با هالتر')).toBeInTheDocument();
    // The written movement timeline has one tab per step; there is no 3D viewer any more.
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });
});
