// @vitest-environment node
import { createServer, get, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { serveStatic } from './static.ts';

let root: string;
let server: Server;
let base: string;
const body = 'const hello = "سلام";\n'.repeat(200);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'meety-static-test-'));
  await mkdir(join(root, 'assets'));
  await mkdir(join(root, 'models'));
  await writeFile(join(root, 'models', 'move.glb'), body);
  await writeFile(join(root, 'models', 'move.glb.gz'), gzipSync(body));
  await writeFile(join(root, 'assets', 'hero.webp'), 'synthetic');
  await writeFile(join(root, 'index.html'), '<html>fallback</html>');
  await writeFile(join(root, 'assets', 'app.js'), body);
  await writeFile(join(root, 'assets', 'app.js.gz'), gzipSync(body));
  await writeFile(join(root, 'plain.css'), 'body { color: black }');
  server = createServer((request, response) => {
    if (!serveStatic(root, request.url ?? '/', response, request)) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (root) await rm(root, { recursive: true, force: true });
});
function request(path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    get(base + path, { headers }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    }).on('error', reject);
  });
}

describe('precompressed public static assets', () => {
  it('returns gzip with the original content type and encoding-specific cache headers', async () => {
    const result = await request('/assets/app.js', { 'Accept-Encoding': 'gzip, deflate' });
    expect(result.status).toBe(200);
    expect(result.headers['content-encoding']).toBe('gzip');
    expect(result.headers['content-type']).toMatch(/^text\/javascript/);
    expect(result.headers.vary).toBe('Accept-Encoding');
    expect(result.headers['cache-control']).toContain('immutable');
    expect(gunzipSync(result.body).toString()).toBe(body);
    expect(result.body.length).toBeLessThan(Buffer.byteLength(body) / 3);
    const fresh = await request('/assets/app.js', { 'Accept-Encoding': 'gzip', 'If-None-Match': result.headers.etag! });
    expect(fresh.status).toBe(304);
    expect(fresh.headers['content-encoding']).toBe('gzip');
    expect(fresh.headers.vary).toBe('Accept-Encoding');
    expect(fresh.body.length).toBe(0);
  });

  it('serves identity when gzip is refused, absent, or not available; variants have distinct ETags', async () => {
    const compressed = await request('/assets/app.js', { 'Accept-Encoding': 'gzip' });
    const raw = await request('/assets/app.js', { 'Accept-Encoding': 'gzip;q=0, *;q=1', 'If-None-Match': compressed.headers.etag! });
    expect(raw.status).toBe(200);
    expect(raw.headers['content-encoding']).toBeUndefined();
    expect(raw.headers.vary).toBe('Accept-Encoding');
    expect(raw.headers.etag).not.toBe(compressed.headers.etag);
    expect(raw.body.toString()).toBe(body);
    const plain = await request('/plain.css', { 'Accept-Encoding': 'gzip' });
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe('body { color: black }');
  });

  it('serves the image and model with their correct types and negotiated model compression', async () => {
    const image = await request('/assets/hero.webp');
    expect(image.headers['content-type']).toBe('image/webp');
    const model = await request('/models/move.glb', { 'Accept-Encoding': 'gzip' });
    expect(model.headers['content-type']).toBe('model/gltf-binary');
    expect(model.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(model.body).toString()).toBe(body);
  });

  it('keeps the client-side route fallback without compressing non-existent files', async () => {
    const result = await request('/program', { 'Accept-Encoding': 'gzip' });
    expect(result.status).toBe(200);
    expect(result.body.toString()).toBe('<html>fallback</html>');
    expect(result.headers['cache-control']).toBe('no-cache');
  });

  it('returns a non-cacheable 404, not the app shell, for missing static assets', async () => {
    for (const path of ['/assets/old-hash.js', '/assets/missing', '/icons/missing.png', '/models/no.glb', '/sw.js']) {
      const result = await request(path);
      expect(result.status, path).toBe(404);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['content-type']).toMatch(/^text\/plain/);
      expect(result.body.toString()).not.toContain('<html>');
    }
  });
});
