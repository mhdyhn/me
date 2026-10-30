// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { hashPassword } from './auth.ts';
import { openDatabase, type Db } from './db.ts';
import { insertUser } from './users.ts';

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

  it('authenticates all roles without cookies and keeps native-origin personal records separate', async () => {
    const password = 'native-test-pass-123';
    const hash = hashPassword(password);
    for (const role of ['coach', 'student'] as const) {
      await insertUser(db, { username: `native-${role}`, passwordHash: hash, role, displayName: role, coachId: null, mustChangePassword: false, now: new Date() });
    }
    const sessions: Array<{ role: string; id: number; token: string }> = [];
    for (const [role, username, pass] of [
      ['admin', 'owner', 'owner-pass-123'], ['coach', 'native-coach', password], ['student', 'native-student', password],
    ]) {
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://localhost' },
        body: JSON.stringify({ username, password: pass }),
      });
      expect(login.status).toBe(200);
      expect(login.headers.get('access-control-allow-origin')).toBe('https://localhost');
      const { user, token } = (await login.json()) as { user: { id: number; role: string }; token: string };
      expect(user.role).toBe(role);
      const headers = { Origin: 'https://localhost', Authorization: `Bearer ${token}`, 'X-Meety-Session': token };
      const me = await fetch(`${base}/api/me`, { headers });
      expect(me.status).toBe(200);
      expect((await me.json() as { user: { id: number } }).user.id).toBe(user.id);
      const saved = await fetch(`${base}/api/me/personal-data/batch`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: user.id, changes: [{ kind: 'bodyweight', key: 'native-weight', baseVersion: 0, operationId: `native-weight-${role}`, deleted: false, value: { id: 'native-weight', date: '2026-10-30', weightKg: role === 'admin' ? 80 : role === 'coach' ? 70 : 60 } }] }),
      });
      expect(saved.status).toBe(200);
      expect(saved.headers.get('access-control-allow-origin')).toBe('https://localhost');
      expect((await saved.json() as { results: Array<{ status: string }> }).results[0].status).toBe('saved');
      sessions.push({ role, id: user.id, token });
    }
    for (const session of sessions) {
      const headers = { Origin: 'https://localhost', Authorization: `Bearer ${session.token}` };
      const own = await fetch(`${base}/api/me/personal-data?accountId=${session.id}`, { headers });
      const data = await own.json() as { records: Array<{ value: { weightKg: number } }> };
      expect(data.records).toHaveLength(1);
      expect(data.records[0].value.weightKg).toBe(session.role === 'admin' ? 80 : session.role === 'coach' ? 70 : 60);
      const other = sessions.find((item) => item.id !== session.id)!;
      const mismatch = await fetch(`${base}/api/me/personal-data?accountId=${other.id}`, { headers });
      expect(mismatch.status).toBe(409);
    }
  });
});
