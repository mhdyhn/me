// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';

let db: Db;
let server: Server;
let base: string;

beforeEach(async () => {
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', new Date('2026-10-13T08:00:00Z'));
  server = createServer(createApp({ db, secretKey: keyFromSecret('test-secret-for-the-suite') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});

describe('app origin (Android build) calls the API', () => {
  // The browser sends this preflight before a request that carries the session headers.
  it('allows the Authorization and X-Meety-Session headers that the app sends', async () => {
    const response = await fetch(`${base}/api/me`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://localhost',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,x-meety-session',
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://localhost');
    const allowed = (response.headers.get('access-control-allow-headers') ?? '').toLowerCase();
    expect(allowed).toContain('authorization');
    expect(allowed).toContain('x-meety-session');
  });

  it('rejects an untrusted origin, including preflight and credentialed requests', async () => {
    const preflight = await fetch(`${base}/api/me`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'GET' } });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    const request = await fetch(`${base}/api/me`, { headers: { Origin: 'https://untrusted.example', Cookie: 'meety_session=bad' } });
    expect(request.status).toBe(403);
    expect(request.headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('accepts the application same-origin request', async () => {
    const response = await fetch(`${base}/api/health`, { headers: { Origin: base } });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(base);
  });

  it('keeps a session working when only the custom header is sent', async () => {
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
      body: JSON.stringify({ username: 'owner', password: 'owner-pass-123' }),
    });
    const { token } = (await login.json()) as { token: string };
    const me = await fetch(`${base}/api/me`, { headers: { Origin: 'https://localhost', 'X-Meety-Session': token } });
    expect(me.status).toBe(200);
  });
});
