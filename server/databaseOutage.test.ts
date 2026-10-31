// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { DatabaseError, lazyDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

const key = keyFromSecret('database-outage-test-secret');

async function serve(db: Db): Promise<{ server: Server; base: string }> {
  const server = createServer(createApp({ db, secretKey: key }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('a database outage is explained instead of hanging', () => {
  it('gives up at once when the address or the password is wrong', async () => {
    // Waiting cannot fix a wrong password, so the answer must not wait for the timeout.
    const failure = { code: '28P01', message: 'اطلاعات دسترسی پایگاه داده درست نیست.' };
    const db = lazyDatabase(new Promise<Db>(() => {}), 30000, () => failure);
    const startedAt = Date.now();
    await expect(db.query('SELECT 1')).rejects.toMatchObject({ status: 503, database: true });
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it('keeps waiting when the database is only slow to wake up', async () => {
    const failure = { code: 'ETIMEDOUT', message: 'اتصال به پایگاه داده به وقت گذشت.' };
    const db = lazyDatabase(new Promise<Db>(() => {}), 200, () => failure);
    const startedAt = Date.now();
    await expect(db.query('SELECT 1')).rejects.toMatchObject({ status: 503 });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150);
  });

  it('marks the answer of a failed route as a database problem', async () => {
    const db: Db = {
      async query() { throw new DatabaseError(503, 'پایگاه داده در دسترس نیست.'); },
      async exec() {},
      async close() {},
      isReady: () => false,
      startupFailure: () => ({ code: '53000', message: 'سرویس پایگاه داده از دسترس خارج است؛ دسترسی حساب یا سهمیهٔ آن بررسی شود.' }),
    };
    const { server, base } = await serve(db);
    try {
      const response = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'coach', password: 'secret' }),
      });
      const body = await response.json() as { database?: boolean; error?: string };
      expect(response.status).toBe(503);
      expect(body.database).toBe(true);
      expect(typeof body.error).toBe('string');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('tells the client why the database is not reachable', async () => {
    const db: Db = {
      async query() { throw new DatabaseError(503, 'پایگاه داده در دسترس نیست.'); },
      async exec() {},
      async close() {},
      isReady: () => true,
      startupFailure: () => ({ code: '53000', message: 'سرویس پایگاه داده از دسترس خارج است؛ دسترسی حساب یا سهمیهٔ آن بررسی شود.' }),
    };
    const { server, base } = await serve(db);
    try {
      const response = await fetch(`${base}/api/health?probe=1`);
      const body = await response.json() as { database?: boolean; error?: { message?: string } };
      expect(response.status).toBe(503);
      expect(body.database).toBe(false);
      expect(body.error?.message).toContain('سرویس پایگاه داده');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('names a wrong password, also when the host blocked the connections', async () => {
    const blocked = Object.assign(new Error('(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked'), { code: 'XX000' });
    const db = lazyDatabase(Promise.reject(blocked));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(db.startupFailure!()!.message).toContain('رمز عبور');
  });

  it('names no provider in the reason', async () => {
    const db = lazyDatabase(Promise.reject(Object.assign(new Error('too many connections'), { code: '53000' })));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const reported = db.startupFailure!()!;
    expect(reported.message).not.toMatch(/neon|supabase|aiven/i);
    expect(reported.message).toContain('سرویس پایگاه داده');
  });
});
