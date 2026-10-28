// @vitest-environment node
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { openDatabase, type Db } from './db.ts';
import { keyFromSecret } from './secrets.ts';

let db: Db;
let server: Server;
let base: string;

beforeAll(async () => {
  db = await openDatabase('memory');
  server = createServer(createApp({ db, secretKey: keyFromSecret('local-release-check-secret') }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 30000);

afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
}, 30000);

describe('public deployment identity', () => {
  it('reports the main deployment and validated commit without caching', async () => {
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('RENDER_GIT_BRANCH', 'main');
    vi.stubEnv('RENDER_GIT_COMMIT', 'A087B524E3BC999DCC46FDED3AF9EE9A0C76555B');
    const response = await fetch(`${base}/api/release`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ stableBranch: 'main', deploymentBranch: 'main', revision: 'a087b524e3bc999dcc46fded3af9ee9a0c76555b' });
  });

  it('reports other branches without exposing their names or invalid environment values', async () => {
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('RENDER_GIT_BRANCH', 'some-private-branch');
    vi.stubEnv('RENDER_GIT_COMMIT', 'not-a-git-commit');
    const response = await fetch(`${base}/api/release`);
    expect(await response.json()).toEqual({ stableBranch: 'main', deploymentBranch: 'other', revision: null });
  });

  it('reports unknown when Render metadata is missing or this is another environment', async () => {
    vi.stubEnv('RENDER', 'true');
    vi.stubEnv('RENDER_GIT_BRANCH', '');
    vi.stubEnv('RENDER_GIT_COMMIT', '');
    const missing = await fetch(`${base}/api/release`);
    expect(await missing.json()).toEqual({ stableBranch: 'main', deploymentBranch: 'unknown', revision: null });
    vi.stubEnv('RENDER', 'false');
    vi.stubEnv('RENDER_GIT_BRANCH', 'main');
    vi.stubEnv('RENDER_GIT_COMMIT', '1234567');
    const notRender = await fetch(`${base}/api/release`);
    expect(await notRender.json()).toEqual({ stableBranch: 'main', deploymentBranch: 'unknown', revision: null });
  });
});
