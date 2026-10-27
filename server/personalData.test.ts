// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { keyFromSecret } from './secrets.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase, type Db } from './db.ts';
import { migratePersonalData } from './personalData.ts';

let db: Db; let server: Server; let base: string;
const now = new Date('2026-10-27T12:00:00Z');
beforeEach(async () => {
  db = await openDatabase('memory');
  await ensureAdmin(db, 'owner', 'owner-pass-123', now);
  await ensureAdmin(db, 'other', 'other-pass-123', now);
  server = createServer(createApp({ db, now: () => now, secretKey: keyFromSecret('test-secret-for-the-suite') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await db.close(); });
async function request(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, json: await response.json() as Record<string, any>, headers: response.headers };
}
async function login(name: string, password: string) { return (await request('POST', '/api/auth/login', { username: name, password })).json.token as string; }
const weight = (kg: number) => ({ id: 'weight-1', date: '2026-10-27', weightKg: kg, notes: '' });
const change = (version: number, kg: number, op: string) => ({ kind: 'bodyweight', key: 'weight-1', baseVersion: version, operationId: op, deleted: false, value: weight(kg) });

describe('personal data sync', () => {
  it('isolates accounts and prevents stale writes, while retry and deletion are safe', async () => {
    const firstDevice = await login('owner', 'owner-pass-123');
    const secondDevice = await login('owner', 'owner-pass-123');
    const other = await login('other', 'other-pass-123');
    expect((await request('GET', '/api/me/personal-data?accountId=1')).status).toBe(401);
    const saved = await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(0, 80, 'op-initial-1')] }, firstDevice);
    expect(saved.json.results[0]).toMatchObject({ status: 'saved', current: { version: 1, value: { weightKg: 80 } } });
    const read = await request('GET', '/api/me/personal-data?accountId=1', undefined, secondDevice);
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(read.json.records).toMatchObject([{ version: 1, value: { weightKg: 80 } }]);
    expect((await request('GET', '/api/me/personal-data?accountId=2', undefined, other)).json.records).toEqual([]);
    // A switched token must never retarget the former account's background sync.
    expect((await request('GET', '/api/me/personal-data?accountId=1', undefined, other)).status).toBe(409);
    expect((await request('GET', '/api/me/personal-data', undefined, other)).status).toBe(409);
    expect((await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(0, 99, 'wrong-account-op')] }, other)).status).toBe(409);
    expect((await request('POST', '/api/me/personal-data/batch', { changes: [change(0, 99, 'missing-account-op')] }, other)).status).toBe(409);
    expect((await request('GET', '/api/me/personal-data?accountId=2', undefined, other)).json.records).toEqual([]);

    const concurrent = await Promise.all([
      request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(1, 81, 'op-device-one')] }, firstDevice),
      request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(1, 82, 'op-device-two')] }, secondDevice),
    ]);
    expect(concurrent.map((r) => r.json.results[0].status).sort()).toEqual(['conflict', 'saved']);
    const winner = concurrent.find((r) => r.json.results[0].status === 'saved')!.json.results[0];
    expect(winner.current.version).toBe(2);
    const retryOp = winner.current.value.weightKg === 81 ? 'op-device-one' : 'op-device-two';
    const retry = await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(1, winner.current.value.weightKg, retryOp)] }, firstDevice);
    expect(retry.json.results[0]).toMatchObject({ status: 'saved', current: { version: 2 } });
    const deleted = await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [{ ...change(2, 80, 'op-delete-one'), deleted: true, value: null }] }, firstDevice);
    expect(deleted.json.results[0]).toMatchObject({ status: 'saved', current: { version: 3, deleted: true, value: null } });
    const stale = await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(2, 79, 'op-stale-write')] }, secondDevice);
    expect(stale.json.results[0]).toMatchObject({ status: 'conflict', current: { version: 3, deleted: true } });
  });

  it('rejects malformed input and supports paginated histories', async () => {
    const token = await login('owner', 'owner-pass-123');
    expect((await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [change(0, 9999, 'bad-weight-1')] }, token)).status).toBe(400);
    expect((await request('POST', '/api/me/personal-data/batch', { accountId: 1, changes: [{ ...change(0, 80, 'bad-kind-123'), kind: 'unknown' }] }, token)).status).toBe(400);
    await db.query(`INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
      SELECT 1, 'bodyweight', 'item-' || n, 1, '{"id":"unused","date":"2026-10-27","weightKg":80}', 0, $1, 'seed-operation' FROM generate_series(1, 105) AS n`, [now.toISOString()]);
    const page1 = await request('GET', '/api/me/personal-data?accountId=1', undefined, token);
    expect(page1.json.records).toHaveLength(100);
    expect(page1.json.nextCursor).toBeTruthy();
    const page2 = await request('GET', `/api/me/personal-data?accountId=1&cursor=${encodeURIComponent(page1.json.nextCursor)}`, undefined, token);
    expect(page2.json.records).toHaveLength(5);
    expect(page2.json.nextCursor).toBeNull();
    expect((await request('GET', '/api/me/personal-data?accountId=1&cursor=bad', undefined, token)).status).toBe(400);
  });

  it('imports legacy server programs without overwriting a newer synced copy', async () => {
    await db.query('INSERT INTO user_personal_programs (user_id, body, updated_at) VALUES ($1, $2, $3)', [1, JSON.stringify([{ id: 'legacy' }]), now.toISOString()]);
    await migratePersonalData(db);
    const token = await login('owner', 'owner-pass-123');
    const first = await request('GET', '/api/me/personal-program', undefined, token);
    expect(first.json.program).toEqual([{ id: 'legacy' }]);
    await db.query('UPDATE personal_data_records SET body = $1, version = 2 WHERE user_id = 1 AND kind = $2', [JSON.stringify([]), 'program']);
    await migratePersonalData(db);
    expect((await request('GET', '/api/me/personal-program', undefined, token)).json.program).toEqual([]);
  });
});
