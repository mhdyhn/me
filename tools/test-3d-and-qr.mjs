// Production-build browser checks: no real accounts, payments, or external QR service.
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
import { serveStatic } from '../server/static.ts';

const code = 'AbCdEfGhIjKlMnOpQrStUvWxYz123456';
const student = { id: 5, username: 'student', displayName: 'شاگرد نمونه', role: 'student', coachId: 4, selfRegistered: true, coachAccess: true, mustChangePassword: false, isActive: true };
const coach = { id: 4, username: 'coach', displayName: 'مربی نمونه', role: 'coach', coachId: null, mustChangePassword: false, isActive: true };
const program = { id: 'program-1', version: 1, title: 'برنامه نمونه', priceTomans: 0, updatedAt: '2026-01-01T00:00:00Z', days: [{ name: 'روز اول', exercises: [
  { exerciseId: 'push-up', name: 'شنا سوئدی', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 },
  { exerciseId: 'diamond-push-up', name: 'شنا سوئدی الماسی', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 },
  { exerciseId: 'swedish-dip', name: 'شنا سوئدی', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 },
] }] };
const root = resolve('dist');
const server = createServer((request, response) => {
  if (!serveStatic(root, new URL(request.url ?? '/', 'http://localhost').pathname, response, request)) { response.writeHead(404); response.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
const requests = [];
async function makeContext(user, options = {}) {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, serviceWorkers: 'block', ...options });
  await context.addInitScript((account) => {
    localStorage.setItem('meety.session-token', 'fake-test-token');
    localStorage.setItem('meety.session-user', JSON.stringify(account));
    localStorage.setItem('meety.account-scope', `user-${account.id}`);
  }, user);
  await context.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let result = {};
    if (path === '/api/me') result = { user };
    else if (path === '/api/me/program') result = { program, coachName: coach.displayName, isPaid: true };
    else if (path === '/api/me/personal-data') result = { records: [], nextCursor: null };
    else if (path === '/api/students') result = { students: [] };
    else if (path === '/api/coach/invitations') result = { code, expiresAt: '2026-11-01T00:00:00Z' };
    await route.fulfill({ status: 200, json: result });
  });
  context.on('request', (request) => requests.push(request.url()));
  return context;
}
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

  const context = await makeContext(student);
  const page = await context.newPage();
  await page.goto(base + '/exercise/push-up', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' })).toBeVisible();
  if (requests.some((url) => /\/models\/|vendor-three-|ExerciseModel3D-/.test(url))) throw new Error('3D was fetched before an explicit request');
  await page.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' }).click();
  const pause = page.getByRole('button', { name: 'توقف حرکت' });
  await expect(pause).toBeEnabled({ timeout: 30000 });
  if (!requests.some((url) => /\/models\/push-up-[a-f0-9]+\.glb/.test(url))) throw new Error('3D model was not fetched');
  const stage = page.locator('.exercise-3d__stage');
  // Fixed mobile navigation is not part of the model frame being compared.
  await page.addStyleTag({ content: '.mobile-nav,.exercise-mobile-footer { display:none !important }' });
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const movingA = await stage.screenshot();
  await page.waitForTimeout(600);
  const movingB = await stage.screenshot();
  if (movingA.equals(movingB)) throw new Error('3D frame did not visibly animate');
  await pause.click();
  await page.waitForTimeout(250);
  const pausedA = await stage.screenshot();
  await page.waitForTimeout(600);
  const pausedB = await stage.screenshot();
  if (!pausedA.equals(pausedB)) throw new Error('3D frame continued after pause');
  await page.getByRole('button', { name: 'نمای روبه‌رو' }).click();
  await page.waitForTimeout(250);
  if (pausedB.equals(await stage.screenshot())) throw new Error('View control did not change the model view');
  await expect(page.getByAltText('شنا سوئدی: وضعیت شروع')).toBeAttached();
  await page.getByRole('button', { name: 'بستن نمای سه‌بعدی' }).click();
  await expect(stage).toHaveCount(0);
  await page.goto(base + '/exercise/diamond-push-up', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('شنا سوئدی الماسی', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' })).toHaveCount(0);
  await page.goto(base + '/exercise/swedish-dip', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Swedish Dip / Parallel Bars')).toBeVisible();
  await expect(page.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' })).toHaveCount(0);
  await context.close();

  const reduced = await makeContext(student, { reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(base + '/exercise/push-up', { waitUntil: 'domcontentloaded' });
  await reducedPage.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' }).click();
  await expect(reducedPage.getByRole('button', { name: 'پخش حرکت' })).toBeEnabled({ timeout: 30000 });
  await reduced.close();

  const failed = await makeContext(student);
  await failed.route('**/models/**', (route) => route.abort());
  const failedPage = await failed.newPage();
  await failedPage.goto(base + '/exercise/push-up', { waitUntil: 'domcontentloaded' });
  await failedPage.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' }).click();
  await expect(failedPage.getByRole('alert').filter({ hasText: 'نمای سه‌بعدی در دسترس نیست' })).toBeAttached({ timeout: 30000 });
  await expect(failedPage.getByAltText('شنا سوئدی: وضعیت شروع')).toBeAttached();
  await failed.close();

  const badChunk = await makeContext(student);
  await badChunk.route('**/assets/vendor-three-*.js', (route) => route.abort());
  const badChunkPage = await badChunk.newPage();
  await badChunkPage.goto(base + '/exercise/push-up', { waitUntil: 'domcontentloaded' });
  await badChunkPage.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' }).click();
  await expect(badChunkPage.getByRole('alert').filter({ hasText: 'دریافت نمای سه‌بعدی انجام نشد' })).toBeAttached({ timeout: 30000 });
  await expect(badChunkPage.getByAltText('شنا سوئدی: وضعیت شروع')).toBeAttached();
  await badChunk.close();

  const noWebgl = await makeContext(student);
  await noWebgl.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return original.call(this, type, ...args);
    };
  });
  const noWebglPage = await noWebgl.newPage();
  await noWebglPage.goto(base + '/exercise/push-up', { waitUntil: 'domcontentloaded' });
  await noWebglPage.getByRole('button', { name: 'نمایش حرکت سه‌بعدی' }).click();
  await expect(noWebglPage.getByRole('alert').filter({ hasText: 'نمای سه‌بعدی در دسترس نیست' })).toBeAttached({ timeout: 30000 });
  await expect(noWebglPage.getByAltText('شنا سوئدی: وضعیت شروع')).toBeAttached();
  await noWebgl.close();

  const beforeQr = requests.length;
  const coachContext = await makeContext(coach);
  const coachPage = await coachContext.newPage();
  await coachPage.goto(base + '/coach', { waitUntil: 'domcontentloaded' });
  await coachPage.getByText('دعوت شاگرد با حساب خودش').click();
  await coachPage.getByRole('button', { name: 'ساخت کد دعوت' }).click();
  await expect(coachPage.getByText(code)).toBeVisible();
  await coachPage.getByRole('button', { name: 'نمایش QR' }).click();
  const qr = coachPage.getByRole('img', { name: 'کد QR دعوت محرمانهٔ شاگرد' });
  await expect(qr).toBeVisible();
  if (!(await qr.getAttribute('src'))?.startsWith('data:image/svg+xml')) throw new Error('QR is not generated locally');
  await coachPage.addStyleTag({ content: '.mobile-nav { display:none !important }' });
  const png = PNG.sync.read(await qr.screenshot());
  const decoded = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  if (decoded?.data !== code) throw new Error('QR did not decode to the invitation code');
  const external = requests.slice(beforeQr).filter((url) => !url.startsWith(base + '/') && !url.startsWith('data:'));
  if (external.length) throw new Error('Unexpected cross-origin request during QR generation');
  await expect(coachPage.getByText(/اتصال فقط پس از بررسی نام مربی و رضایت شاگرد/)).toBeVisible();
  await coachContext.close();
  console.log('PASS: 3D and QR at 320px; 3D is opt-in; animation, pause, view, reduced motion, model/chunk/WebGL fallbacks and exact movement mapping; QR decoded to the local one-use secret without cross-origin requests.');
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
