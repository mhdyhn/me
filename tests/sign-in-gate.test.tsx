import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

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

describe('sign-in gate', () => {
  it('without a session the app opens on the sign-in screen, not the personal dashboard', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'ورود به میتی' })).toBeInTheDocument();
    expect(screen.queryByText('جلسهٔ بعدی')).not.toBeInTheDocument();
  });
});
