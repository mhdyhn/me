import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.ts';
import { ensureAdmin } from './bootstrap.ts';
import { openDatabase } from './db.ts';

const port = Number(process.env.PORT ?? 8787);
// Local by default: the dev server proxies /api to it. Set HOST=0.0.0.0 only behind a real host or reverse proxy.
const host = process.env.HOST ?? '127.0.0.1';
const dataFile = resolve(process.env.DATA_FILE ?? 'server/data/meety.sqlite');
mkdirSync(dirname(dataFile), { recursive: true });

const db = openDatabase(dataFile);
const adminState = ensureAdmin(db, process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, new Date());
if (adminState === 'created') console.log('Admin account created from ADMIN_USERNAME.');

const server = createServer(createApp({ db }));
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
