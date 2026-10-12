import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';
import { keyFromSecret } from './secrets.ts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const port = Number(process.env.PORT ?? 8787);
// 0.0.0.0 so the sandbox preview can reach it. The root answers 200 so the preview is not an error page.
// On a real host, put a reverse proxy in front and set HOST to the address it should reach.
const host = process.env.HOST ?? '0.0.0.0';
const dataFile = resolve(process.env.DATA_FILE ?? 'server/data/meety.sqlite');
mkdirSync(dirname(dataFile), { recursive: true });

const db = openDatabase(dataFile);
const adminState = ensureAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, new Date());
if (adminState === 'created') console.log('Admin account created from ADMIN_USERNAME.');

const server = createServer(createApp({ db, secretKey: loadSecretKey(dirname(dataFile)) }));
server.listen(port, host, () => {
  console.log(`Meety API listening on http://${host}:${port}`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
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
