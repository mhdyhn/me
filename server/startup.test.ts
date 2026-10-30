// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { connectDatabase, lazyDatabase, openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

const key = keyFromSecret('startup-health-test-secret');

async function serve(db: Db): Promise<{ server: Server; base: string }> {
  const server = createServer(createApp({ db, secretKey: key }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('the server answers while the database is still waking up', () => {
  it('says that it is starting instead of waiting for the database', async () => {
    let release: (database: Db) => void = () => {};
    const opening = new Promise<Db>((resolve) => { release = resolve; });
    const { server, base } = await serve(lazyDatabase(opening));
    try {
      const startedAt = Date.now();
      const response = await fetch(`${base}/api/health`);
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, database: false, starting: true });
      // The answer must not wait for the database, otherwise the host restarts the instance.
      expect(Date.now() - startedAt).toBeLessThan(2000);

      const real = await openDatabase('memory');
      release(real);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const ready = await fetch(`${base}/api/health`);
      expect(await ready.json()).toMatchObject({ ok: true, database: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30000);

  it('gives up on a query when the database stays unreachable', async () => {
    const db = lazyDatabase(new Promise<Db>(() => {}), 100);
    await expect(db.query('SELECT 1')).rejects.toMatchObject({ status: 503 });
    expect(db.isReady!()).toBe(false);
  });

  it('reports why the database is not reachable, without an address or a secret', async () => {
    const failure = new Error('connect ECONNREFUSED 10.0.0.1:5432') as Error & { code?: string };
    failure.code = 'ECONNREFUSED';
    const db = lazyDatabase(Promise.reject(failure));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const reported = db.startupFailure!();
    expect(reported).toMatchObject({ code: 'ECONNREFUSED', message: 'پایگاه داده اتصال را نپذیرفت.' });
    expect(JSON.stringify(reported)).not.toContain('10.0.0.1');
  });

  it('keeps the reason of a failed connection attempt while it retries', async () => {
    // Port 1 refuses the connection, so the attempt fails at once.
    const db = connectDatabase('postgres://postgres:postgres@127.0.0.1:1/postgres', 500);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const reported = db.startupFailure!();
      expect(reported?.code).toBe('ECONNREFUSED');
      expect(db.isReady!()).toBe(false);
    } finally {
      await db.close();
    }
  }, 30000);

  it('uses the database as soon as it is ready', async () => {
    const real = await openDatabase('memory');
    const db = lazyDatabase(Promise.resolve(real));
    const rows = await db.query<{ value: number }>('SELECT 1 AS value');
    expect(rows[0]?.value).toBe(1);
    expect(db.isReady!()).toBe(true);
    await db.close();
  }, 30000);
});
