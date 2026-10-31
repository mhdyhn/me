// Production-build browser check: the exercise guide must really animate the movement.
// No real accounts, payments, or external services are used.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { serveStatic } from '../server/static.ts';

const student = { id: 5, username: 'student', displayName: 'شاگرد نمونه', role: 'student', coachId: 4, selfRegistered: true, coachAccess: true, mustChangePassword: false, isActive: true };
const root = resolve('dist');
const server = createServer((request, response) => {
  if (!serveStatic(root, new URL(request.url ?? '/', 'http://localhost').pathname, response, request)) { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, serviceWorkers: 'block' });
  await context.addInitScript((account) => {
    localStorage.setItem('meety.session-token', 'fake-test-token');
    localStorage.setItem('meety.session-user', JSON.stringify(account));
    localStorage.setItem('meety.account-scope', `user-${account.id}`);
  }, student);
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result = {};
    if (path === '/api/me') result = { user: student };
    else if (path === '/api/me/personal-data') result = { records: [], nextCursor: null };
    await route.fulfill({ status: 200, json: result });
  });

  const page = await context.newPage();
  await page.goto(base + '/exercise/barbell-bench-press', { waitUntil: 'domcontentloaded' });
  const figure = page.locator('.lyfta-player__motion');
  await expect(figure).toBeVisible({ timeout: 20000 });

  // The figure must move: the drawn body differs between two moments.
  // SMIL paints the animated value, so the pixels are the honest check.
  const snapshot = async () => (await figure.screenshot()).toString('base64');
  const first = await snapshot();
  await page.waitForTimeout(900);
  const second = await snapshot();
  if (!first || first === second) throw new Error('the guide figure did not move');

  // The animation must be pausable and resumable.
  await page.getByRole('button', { name: /توقف/ }).click();
  const paused = await snapshot();
  await page.waitForTimeout(700);
  if ((await snapshot()) !== paused) throw new Error('the guide kept moving while paused');
  await page.getByRole('button', { name: /پخش لوپ/ }).click();
  await page.waitForTimeout(700);
  if ((await snapshot()) === paused) throw new Error('the guide did not resume');

  // A movement without an animated guide keeps the two static phases.
  await page.goto(base + '/exercise/cable-fly', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.lyfta-player__img').first()).toBeVisible({ timeout: 20000 });
  if (await page.locator('.lyfta-player__motion').count()) throw new Error('a movement without a motion file must not show the animated figure');

  console.log('exercise guide: animation, pause, resume and fallback are fine');
} finally {
  await browser?.close();
  server.close();
}
