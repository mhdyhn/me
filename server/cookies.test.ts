// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';

let db: DatabaseSync;
let server: Server;
let base: string;
const clock = new Date('2026-10-13T08:00:00Z');

beforeEach(async () => {
  db = openDatabase(':memory:');
  ensureAdmin(db, 'owner', 'owner-pass-123', clock);
  server = createServer(createApp({ db, now: () => clock }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
});

async function login(): Promise<{ cookie: string; token: string }> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'owner', password: 'owner-pass-123' }),
  });
  const setCookie = response.headers.get('set-cookie') ?? '';
  const token = ((await response.json()) as { token: string }).token;
  return { cookie: setCookie.split(';')[0], token };
}

describe('session cookie', () => {
  it('login sets an HttpOnly, SameSite=Strict session cookie', async () => {
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'owner', password: 'owner-pass-123' }),
    });
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/^meety_session=[A-Za-z0-9_-]{20,}/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Strict');
  });

  it('the cookie alone is enough to reach the signed-in routes', async () => {
    const { cookie } = await login();
    const me = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as { user: { username: string } }).user.username).toBe('owner');
  });

  it('a cookie-authenticated write must be JSON', async () => {
    const { cookie } = await login();
    const response = await fetch(`${base}/api/coaches`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ displayName: 'مربی' }),
    });
    expect(response.status).toBe(415);
  });

  it('logout clears the cookie and revokes the session', async () => {
    const { cookie } = await login();
    const out = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    const after = await fetch(`${base}/api/me`, { headers: { Cookie: cookie } });
    expect(after.status).toBe(401);
  });
});
