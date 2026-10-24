import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

function stubSessionForRole(role: 'student' | 'coach' | 'admin') {
  const user = {
    id: role === 'student' ? 10 : role === 'coach' ? 2 : 1,
    username: `${role}01`,
    role,
    displayName: role === 'student' ? 'شاگرد نمونه' : role === 'coach' ? 'مربی تست' : 'مدیر سیستم',
    coachId: role === 'student' ? 2 : null,
    mustChangePassword: false,
  };

  window.localStorage.setItem('meety.session-token', 'tok-0000000000000001');

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/me/program')) {
      return new Response(
        JSON.stringify({
          programme: { title: 'برنامه هفتگی', days: [], updatedAt: new Date().toISOString() },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/me/chat')) {
      return new Response(
        JSON.stringify({ coachName: 'مربی تست', messages: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/students')) {
      return new Response(
        JSON.stringify({
          students: [
            {
              id: 10,
              displayName: 'شاگرد نمونه',
              username: 'student01',
              role: 'student',
              coachId: 2,
              mustChangePassword: false,
              password: null,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/coaches')) {
      return new Response(
        JSON.stringify({
          coaches: [
            {
              id: 2,
              displayName: 'مربی تست',
              username: 'coach01',
              role: 'coach',
              coachId: null,
              mustChangePassword: false,
              studentCount: 1,
              password: null,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/api/me')) {
      return new Response(
        JSON.stringify({ user }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

beforeEach(async () => {
  await db.sessions.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Three Roles Verification (Student, Coach, Admin)', () => {
  it('STUDENT: enters dashboard, sees student navigation with coach chat, and cannot access /coach', async () => {
    window.history.replaceState({}, '', '/');
    stubSessionForRole('student');
    render(<App />);

    const nav = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    expect(within(nav).getByText('خانه')).toBeInTheDocument();
    expect(within(nav).getByText('برنامه')).toBeInTheDocument();
    expect(within(nav).getByText('حرکت‌ها')).toBeInTheDocument();
    expect(within(nav).getByText('پیشرفت')).toBeInTheDocument();
    expect(within(nav).getByText('مربی')).toBeInTheDocument(); // Chat with coach link
    expect(within(nav).queryByText('شاگرد')).not.toBeInTheDocument();
    expect(within(nav).queryByText('مالی باشگاه')).not.toBeInTheDocument();
    await waitFor(() => expect(document.title).toContain('میتی'));
  });

  it('COACH: accesses coach panel /coach, sees student list, coach actions, and chat with admin', async () => {
    window.history.replaceState({}, '', '/coach');
    stubSessionForRole('coach');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'شاگردهای من' })).toBeInTheDocument();
    expect(screen.getByText('درآمدها و تراکنش‌ها')).toBeInTheDocument();
    expect(screen.getAllByText(/گفتگو با مدیر باشگاه/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('شاگرد نمونه')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'ناوبری موبایل' });
    expect(within(nav).getByText('شاگرد')).toBeInTheDocument();
    expect(within(nav).getByText('افزودن برنامه')).toBeInTheDocument();
    expect(document.title).toContain('شاگردهای من');
  });

  it('ADMIN: accesses /coach and sees AdminHome with coach management and club overview', async () => {
    window.history.replaceState({}, '', '/coach');
    stubSessionForRole('admin');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'مدیریت مربی‌ها و باشگاه' })).toBeInTheDocument();
    expect(screen.getByText('مربیان فعال')).toBeInTheDocument();
    expect(screen.getByText('کل شاگردان باشگاه')).toBeInTheDocument();
    expect(await screen.findByText('مربی تست')).toBeInTheDocument();

    const nav = screen.getByRole('navigation', { name: 'ناوبری موبایل' });
    expect(within(nav).getByText('مربی')).toBeInTheDocument();
    expect(within(nav).getByText('مالی باشگاه')).toBeInTheDocument();
    expect(within(nav).queryByText('شاگرد')).not.toBeInTheDocument();
    expect(document.title).toContain('مدیریت باشگاه و مربی‌ها');
  });
});
