import { join } from 'node:path';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { connectDatabase, type Db } from './db.ts';
import { quarantineOwnerProfileCopies } from './personalData.ts';
import { keyFromSecret } from './secrets.ts';
import { isFile, resolveStaticDir, serveStatic } from './static.ts';
import { readFileSync, writeFileSync } from 'node:fs';

const port = Number(process.env.PORT ?? 8787);
// 0.0.0.0 so the sandbox preview can reach it. The root answers 200 so the preview is not an error page.
// On a real host, put a reverse proxy in front and set HOST to the address it should reach.
const host = process.env.HOST ?? '0.0.0.0';
// Data lives in PostgreSQL. In production that is DATABASE_URL (a hosted PostgreSQL), which survives restarts and redeploys.
// Without DATABASE_URL, local development keeps a PostgreSQL folder under the data directory.
const dataDir = resolve(process.env.DATA_DIR ?? 'server/data');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && process.env.NODE_ENV === 'production') {
  throw new Error('DATABASE_URL must be set in production. Without it, data would be lost on restart.');
}
mkdirSync(dataDir, { recursive: true });

// The database can take a while to wake up (the hosted one scales down when it is idle).
// The web server starts anyway and answers the health check while the connection is made.
const db = connectDatabase(databaseUrl || resolve(dataDir, 'pgdata'));

const api = createApp({ db, secretKey: loadSecretKey(dataDir) });
// One process serves the built app (dist/) and the API, so the deployed site has a single address.
const staticDir = resolveStaticDir(process.env.STATIC_DIR ?? 'dist');
const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (request.method === 'GET' && (pathname === '/meety.apk' || pathname === '/download/meety.apk')) {
    handleApkDownload(staticDir, response);
    return;
  }
  if (staticDir && request.method === 'GET' && !pathname.startsWith('/api')) {
    if (serveStatic(staticDir, pathname, response, request)) return;
  }
  void api(request, response);
});
server.listen(port, host, () => {
  console.log(`Meety API listening on http://${host}:${port}`);
  // Everything that needs the database runs in the background: the site stays reachable
  // while the hosted database wakes up.
  void waitForDatabase(db).then(async (database) => {
    const adminState = await ensureAdmin(database, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, new Date());
    if (adminState === 'created') console.log('Admin account created from ADMIN_USERNAME.');
    if (adminState === 'fallback') console.log('Admin account created without ADMIN_USERNAME; its password is in the log above.');
    // The owner's personal profile may never stay inside another account; a leftover copy is removed.
    // A slow or failing cleanup must never keep the site offline, and the admin panel can still
    // scan and remove the copies on demand.
    const ownerCopies = await quarantineOwnerProfileCopies(database, new Date().toISOString());
    if (ownerCopies.length) console.log(`Owner profile copies removed from: ${ownerCopies.map((item) => item.username).join(', ')}.`);
  }).catch((error: Error) => console.error('Database preparation did not finish:', error.message));
});

/** Waits until the database is really open, so the background work runs on the real connection. */
async function waitForDatabase(db: Db): Promise<Db> {
  for (;;) {
    if (db.isReady?.()) {
      const rows = await db.query<{ value: number }>('SELECT 1 AS value');
      if (rows.length) return db;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

function shutdown(): void {
  const forceTimer = setTimeout(() => {
    console.warn('Forcing exit after timeout.');
    process.exit(1);
  }, 5000);
  forceTimer.unref();

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

function handleApkDownload(staticDir: string | null, response: import('node:http').ServerResponse) {
  if (staticDir) {
    const localApk = join(staticDir, 'meety.apk');
    if (isFile(localApk)) {
      const stat = statSync(localApk);
      response.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="meety.apk"',
        'Cache-Control': 'no-cache',
        'Content-Length': stat.size,
      });
      createReadStream(localApk).pipe(response);
      return;
    }
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end('فایل اندروید تأییدشده برای این نسخه منتشر نشده است.');
}
