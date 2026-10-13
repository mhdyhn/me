import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  it('a coach keeps the whole app and adds the student and add-program sections', async () => {
    stubUser('coach');
    render(<App />);
    const mobile = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    for (const label of ['خانه', 'برنامه', 'حرکت‌ها', 'پیشرفت', 'تغذیه', 'شاگرد', 'افزودن برنامه']) {
      expect(within(mobile).getByText(label)).toBeInTheDocument();
    }
  });

  it('the admin keeps the whole app and adds the coach section', async () => {
    stubUser('admin');
    render(<App />);
    const mobile = await screen.findByRole('navigation', { name: 'ناوبری موبایل' });
    for (const label of ['خانه', 'برنامه', 'حرکت‌ها', 'پیشرفت', 'تغذیه', 'مربی']) {
      expect(within(mobile).getByText(label)).toBeInTheDocument();
    }
    expect(within(mobile).queryByText('شاگرد')).not.toBeInTheDocument();
  });
});
