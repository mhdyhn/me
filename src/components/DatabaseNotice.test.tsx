import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DatabaseNotice } from './DatabaseNotice';

const health = vi.hoisted(() => ({ answer: { ok: true, database: true } as any, status: 200, calls: 0 }));

function stubFetch(overrides: Record<string, unknown> = {}) {
  health.calls = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^.*\/api/, '');
    health.calls += 1;
    const handler = overrides[path] ?? health.answer;
    const body = handler === undefined ? { error: 'unexpected request' } : handler;
    const status = overrides[path] === undefined ? health.status : 200;
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the notice for a database outage', () => {
  it('stays away while the database answers', async () => {
    stubFetch();
    render(<DatabaseNotice />);
    await waitFor(() => expect(health.calls).toBe(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('appears with the reason when the database is down', async () => {
    stubFetch({ '/health?probe=1': { ok: true, database: false, error: { message: 'سرویس پایگاه داده از دسترس خارج است.' } } });
    render(<DatabaseNotice />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('پایگاه داده در دسترس نیست')).toBeTruthy();
    expect(screen.getByText('سرویس پایگاه داده از دسترس خارج است.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeTruthy();
  });

  it('appears when a request fails because of the database', async () => {
    stubFetch();
    render(<DatabaseNotice />);
    await waitFor(() => expect(health.calls).toBe(1));
    act(() => {
      window.dispatchEvent(new CustomEvent('meety:database-unavailable', { detail: { message: 'پایگاه داده در دسترس نیست.' } }));
    });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('پایگاه داده در دسترس نیست.')).toBeTruthy();
  });
});
