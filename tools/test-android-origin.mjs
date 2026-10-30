// Browser smoke test for the bundled client and a disposable cross-origin API, not a native-device test.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../server/app.ts';
import { hashPassword } from '../server/auth.ts';
import { ensureAdmin } from '../server/bootstrap.ts';
import { openDatabase } from '../server/db.ts';
import { keyFromSecret } from '../server/secrets.ts';
import { insertUser } from '../server/users.ts';

const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const temp = mkdtempSync(join(tmpdir(), 'meety-android-origin-'));
let db;
let server;
let browser;
try {
  const key = join(temp, 'test-key.pem');
  const cert = join(temp, 'test-cert.pem');
  const openssl = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
    '-keyout', key, '-out', cert, '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost'], { stdio: 'ignore' });
  if (openssl.status !== 0) throw new Error('Could not create the temporary local TLS certificate.');

  db = await openDatabase('memory');
  const now = new Date();
  const password = 'only-for-disposable-test-123';
  await ensureAdmin(db, 'native-admin', password, now);
  const passwordHash = hashPassword(password);
  for (const role of ['coach', 'student']) {
    await insertUser(db, { username: `native-${role}`, passwordHash, role, displayName: role, coachId: null, mustChangePassword: false, now });
  }
  const handler = createApp({ db, secretKey: keyFromSecret('only-for-disposable-local-native-test') });
  server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, handler);
  await new Promise((yes, no) => server.once('error', no).listen(0, '127.0.0.1', yes));
  const apiOrigin = `https://127.0.0.1:${server.address().port}`;

  // This loopback origin is intentionally test-only; release configuration rejects it.
  const build = spawnSync('npm', ['run', 'build'], {
    stdio: 'inherit', env: { ...process.env, VITE_API_BASE: apiOrigin, VITE_ANDROID_APK_URL: '' },
  });
  if (build.status !== 0) throw new Error('The test-only Android-style web build failed.');
  const dist = resolve('dist');
  // The test API is loopback; the production Android API is public and does not use this flag.
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-features=LocalNetworkAccessChecks'] });
  const sessions = [];
  const unexpectedRequests = [];
  for (const [role, age, weight] of [['admin', '39', '81'], ['coach', '32', '71'], ['student', '28', '61']]) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
    const pageErrors = [];
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === apiOrigin) return route.continue();
      if (url.origin !== 'https://localhost') {
        unexpectedRequests.push(url.origin);
        return route.abort();
      }
      const candidate = resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (candidate !== dist && !candidate.startsWith(dist + sep)) return route.abort();
      let file = candidate;
      if (!existsSync(file) || !statSync(file).isFile()) {
        if (extname(url.pathname)) return route.fulfill({ status: 404, body: 'not found' });
        file = join(dist, 'index.html');
      }
      return route.fulfill({ path: file, contentType: mime[extname(file)] || 'application/octet-stream' });
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') console.error(`Browser error: ${message.text()}`); });
    page.on('requestfailed', (request) => console.error(`Request failed: ${new URL(request.url()).pathname} (${request.failure()?.errorText || 'unknown'})`));
    await page.goto('https://localhost/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('نام کاربری', { exact: true }).fill(`native-${role}`);
    await page.getByLabel('رمز عبور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    if (role === 'coach') await expect(page.getByRole('heading', { name: 'شاگردهای من' })).toBeVisible();
    else await expect(page.getByRole('navigation', { name: 'ناوبری موبایل' })).toBeVisible();
    await page.goto('https://localhost/settings', { waitUntil: 'domcontentloaded' });
    const form = page.locator('.settings-form');
    await expect(form.getByLabel('سن', { exact: true })).toHaveValue('');
    const user = await page.evaluate(() => JSON.parse(localStorage.getItem('meety.session-user') || 'null'));
    if (user?.role !== role) throw new Error(`Incorrect role after ${role} login.`);
    await expect(form).toContainText('هنوز وزنه‌ای ثبت نکرده‌ای');
    await form.getByLabel('سن', { exact: true }).fill(age);
    await form.getByRole('button', { name: 'افزودن وزنهٔ کاری' }).click();
    await form.getByLabel('نام حرکت وزنهٔ ۱').fill(`native-${role}-only`);
    await form.getByLabel('مقدار وزنهٔ ۱ به کیلوگرم').fill(weight);
    await form.getByRole('button', { name: 'ذخیرهٔ پروفایل' }).click();
    await expect(form.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
    const readProfile = async (accountId = user.id) => page.evaluate(async ({ origin, accountId }) => {
      const token = localStorage.getItem('meety.session-token');
      const response = await fetch(`${origin}/api/me/personal-data?accountId=${accountId}`, {
        credentials: 'omit', headers: { Authorization: `Bearer ${token}` },
      });
      return { status: response.status, data: await response.json() };
    }, { origin: apiOrigin, accountId });
    await expect.poll(async () => (await readProfile()).data.records?.find((record) => record.kind === 'profile')?.value?.workingWeightReferences?.[0]?.label, { timeout: 15_000 }).toBe(`native-${role}-only`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(form.getByLabel('سن', { exact: true })).toHaveValue(age);
    await expect(form.getByLabel('نام حرکت وزنهٔ ۱')).toHaveValue(`native-${role}-only`);
    if (pageErrors.length) throw new Error(`${role} page errors: ${pageErrors.join('; ')}`);
    sessions.push({ role, id: user.id, readProfile, context });
    console.log(`PASS: ${role} signs in and saves/reloads isolated data from the native-style origin.`);
  }
  for (const session of sessions) {
    const other = sessions.find((candidate) => candidate.id !== session.id);
    const result = await session.readProfile(other.id);
    if (result.status !== 409) throw new Error(`${session.role} could request another account's records: ${result.status}`);
    await session.context.close();
  }
  if (unexpectedRequests.length) throw new Error(`Unexpected external browser requests were blocked: ${unexpectedRequests.join(', ')}`);
  console.log('PASS: all three roles reject another account ID; browser made no external requests.');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((yes) => server.close(yes));
  if (db) await db.close();
  rmSync(temp, { recursive: true, force: true });
}
