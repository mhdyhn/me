import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { SAVED_CREDENTIALS_KEY } from '../src/pages/account/Login';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
  // No session: the server answers 401 for /api/me.
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'ابتدا وارد شوید.' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-in gate and credentials', () => {
  it('without a session the app opens on the sign-in screen, not the personal dashboard', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'خوش آمدید' })).toBeInTheDocument();
    expect(screen.queryByText('جلسهٔ بعدی')).not.toBeInTheDocument();
    expect(screen.getByLabelText('ذخیره نام کاربری و رمز عبور')).toBeChecked();
  });

  it('restores saved credentials on load and allows clearing them', async () => {
    window.localStorage.setItem(
      SAVED_CREDENTIALS_KEY,
      JSON.stringify({ username: 'alireza', password: 'secret123Password', remember: true })
    );

    render(<App />);
    const usernameInput = await screen.findByLabelText('نام کاربری') as HTMLInputElement;
    const passwordInput = screen.getByLabelText('رمز عبور') as HTMLInputElement;

    expect(usernameInput.value).toBe('alireza');
    expect(passwordInput.value).toBe('secret123Password');

    const clearBtn = screen.getByRole('button', { name: 'حذف ذخیره' });
    await userEvent.click(clearBtn);

    expect(usernameInput.value).toBe('');
    expect(passwordInput.value).toBe('');
    expect(window.localStorage.getItem(SAVED_CREDENTIALS_KEY)).toBeNull();
  });
});
