import { extname, join, normalize, sep } from 'node:path';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const port = Number(process.env.PORT ?? 8787);
// 0.0.0.0 so the sandbox preview can reach it. The root answers 200 so the preview is not an error page.
// On a real host, put a reverse proxy in front and set HOST to the address it should reach.
const host = process.env.HOST ?? '0.0.0.0';
// Data lives in PostgreSQL. In production that is DATABASE_URL (Neon), which survives restarts and redeploys.
// Without DATABASE_URL, local development keeps a PostgreSQL folder under the data directory.
const dataDir = resolve(process.env.DATA_DIR ?? 'server/data');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL must be set in production. Without it, data would be lost on restart.');
}
mkdirSync(dataDir, { recursive: true });

const db = await openWithRetry(databaseUrl || resolve(dataDir, 'pgdata'));
const adminState = await ensureAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, new Date());
if (adminState === 'created') console.log('Admin account created from ADMIN_USERNAME.');

const api = createApp({ db, secretKey: loadSecretKey(dataDir) });
// One process serves the built app (dist/) and the API, so the deployed site has a single address.
const staticDir = resolveStaticDir(process.env.STATIC_DIR ?? 'dist');
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (staticDir && request.method === 'GET' && !pathname.startsWith('/api')) {
    if (serveStatic(staticDir, pathname, response)) return;
  }
  void api(request, response);
});
server.listen(port, host, () => {
  console.log(`Meety API listening on http://${host}:${port}`);
});

/** The hosted database may take a few seconds to wake up, so the first connection is retried before giving up. */
async function openWithRetry(target: string) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await openDatabase(target);
    } catch (error) {
      if (attempt >= 10) throw error;
      console.error(`Database not ready (attempt ${attempt}); retrying in 3 seconds.`, (error as Error).message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

function shutdown(): void {
  server.close(() => {
    void db.close().finally(() => process.exit(0));
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

/**
 * MEETY_SECRET protects the generated passwords shown on the cards. In production it must be set;
 * in development a key file is created next to the database (git-ignored with the data folder).
 */
function loadSecretKey(dataDir: string) {
  const fromEnv = process.env.MEETY_SECRET;
  if (fromEnv && fromEnv.length >= 16) return keyFromSecret(fromEnv);
  if (process.env.NODE_ENV === 'production') throw new Error('MEETY_SECRET (16 characters or more) must be set in production.');
  const file = resolve(dataDir, 'dev-secret.key');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  return keyFromSecret(readFileSync(file, 'utf8').trim());
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** The folder with the built app, or null when it has not been built (API-only mode). */
function resolveStaticDir(path: string): string | null {
  const dir = resolve(path);
  return existsSync(join(dir, 'index.html')) ? dir : null;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Serves a built file. Unknown paths get index.html so the client-side router can take over. */
function serveStatic(root: string, pathname: string, response: import('node:http').ServerResponse): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const candidate = normalize(join(root, decoded));
  if (candidate !== root && !candidate.startsWith(root + sep)) return false; // path traversal
  let file = candidate;
  if (!isFile(file)) file = join(root, 'index.html');
  if (!isFile(file)) return false;
  const immutable = file.startsWith(join(root, 'assets') + sep);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': statSync(file).size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  createReadStream(file).pipe(response);
  return true;
}
