// Real-browser, natural update test. PWA_PREVIOUS_DIST must point to a built older release.
// It never calls registration.update() to force the legacy installation to update.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveStatic } from '../server/static.ts';

if (!process.env.PWA_PREVIOUS_DIST) throw new Error('Set PWA_PREVIOUS_DIST to the older release dist directory.');
const previous = resolve(process.env.PWA_PREVIOUS_DIST);
const current = resolve('dist');
const builtWorker = await readFile(resolve(current, 'sw.js'), 'utf8');
assert.doesNotMatch(builtWorker, /\bimportScripts\s*\(/, 'worker runtime and helpers should be self-contained');
assert.match(builtWorker, /Keep recently cached, public hashed bundles/);
let root = previous;
let workerVariant = 1;
let serverUnavailable = false;
let failInstall = false;
let installFailureObserved = () => {};
let stallProgramBody = false;
const users = [
  { id: 101, username: 'student-manual', displayName: 'شاگرد دستی', role: 'student', coachId: 4, selfRegistered: false },
  { id: 102, username: 'student-self', displayName: 'شاگرد خودثبت‌نام', role: 'student', coachId: 4, selfRegistered: true },
  { id: 103, username: 'coach-manual', displayName: 'مربی دستی', role: 'coach', coachId: null, selfRegistered: false },
  { id: 104, username: 'coach-self', displayName: 'مربی خودثبت‌نام', role: 'coach', coachId: null, selfRegistered: true },
  { id: 105, username: 'admin', displayName: 'مدیر', role: 'admin', coachId: null, selfRegistered: false },
  { id: 106, username: 'independent', displayName: 'شاگرد مستقل', role: 'student', coachId: null, selfRegistered: true },
].map((user) => ({ ...user, isActive: true, mustChangePassword: false, coachAccess: true }));
const byToken = new Map(users.map((user) => [`fixture-${user.id}`, user]));
const programme = {
  id: 'fixture-program', version: 1, title: 'برنامهٔ آزمایشی', priceTomans: 0, updatedAt: '2026-10-29T12:00:00Z',
  days: [{ name: 'روز آزمایشی شاگرد', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 60 }] }],
};
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (process.env.DEBUG_PWA) response.on('finish', () => console.log('HTTP', root === current ? 'new' : 'old', response.statusCode, path));
  if (path.startsWith('/api/')) {
    const user = byToken.get(request.headers['x-meety-session']);
    if (path === '/api/me/program' && stallProgramBody) {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.write('{"program":');
      return;
    }
    let body = {};
    if (path === '/api/me') body = { user };
    else if (path === '/api/me/program') body = { program: programme, isPaid: true, coachName: 'مربی آزمایشی' };
    else if (path === '/api/me/personal-data') body = { records: [], nextCursor: null };
    else if (path === '/api/me/personal-data/batch') body = { results: [] };
    else if (path === '/api/students') body = { students: [] };
    else if (path === '/api/coaches') body = { coaches: [] };
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(body));
    return;
  }
  if (serverUnavailable && !path.startsWith('/assets/')) {
    response.writeHead(503, { 'Cache-Control': 'no-store' }); response.end('unavailable'); return;
  }
  if (root === current && path === '/app-update.js' && failInstall) {
    response.writeHead(503, { 'Cache-Control': 'no-store' }); response.end('unavailable');
    installFailureObserved();
    return;
  }
  if (root === current && path === '/' && workerVariant > 1) {
    const html = await readFile(resolve(current, 'index.html'), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html.replace('</head>', '<meta name="pwa-test-next-deployment" content="online"></head>'));
    return;
  }
  if (root === current && path === '/sw.js' && workerVariant > 1) {
    const script = await readFile(resolve(current, 'sw.js'), 'utf8');
    response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
    response.end(`${script}\n// Simulated later deployment ${workerVariant}\n`);
    return;
  }
  if (!serveStatic(root, path, response, request)) { response.writeHead(404); response.end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
let browser;

async function contextFor(user) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  if (process.env.DEBUG_PWA) {
    context.on('serviceworker', (worker) => {
      console.log('SERVICE WORKER', worker.url());
      worker.on('console', (message) => console.log('WORKER', message.text()));
      worker.on('close', () => console.log('WORKER CLOSED'));
    });
    context.on('page', (page) => page.on('pageerror', (error) => console.log('PAGE ERROR', error.message)));
  }
  await context.addInitScript((user) => {
    if (!/^https?:$/.test(location.protocol)) return;
    if (!localStorage.getItem('meety.session-token')) {
      localStorage.setItem('meety.session-token', `fixture-${user.id}`);
      localStorage.setItem('meety.session-user', JSON.stringify(user));
      localStorage.setItem('meety.account-scope', `user-${user.id}`);
    }
    window.__controllerChanges = 0;
    navigator.serviceWorker.addEventListener('controllerchange', () => { window.__controllerChanges += 1; });
  }, user);
  return context;
}
async function oldPage(context, path = '/') {
  const page = await context.newPage();
  await page.goto(base + path, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  assert.equal(await page.locator('script[src="/app-update.js"]').count(), 0, 'fixture must actually be an older build');
  return page;
}
async function putSentinels(page) {
  await page.evaluate(async () => {
    localStorage.setItem('upgrade-test-sentinel', 'preserved');
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('upgrade-test-storage', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('values');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('values', 'readwrite');
        transaction.objectStore('values').put('preserved', 'value');
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}
async function checkSentinels(page) {
  const values = await page.evaluate(async () => ({
    local: localStorage.getItem('upgrade-test-sentinel'),
    indexed: await new Promise((resolve, reject) => {
      const request = indexedDB.open('upgrade-test-storage');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('values', 'readonly');
        const read = tx.objectStore('values').get('value');
        read.onsuccess = () => { db.close(); resolve(read.result); };
        read.onerror = () => reject(read.error);
      };
    }),
  }));
  assert.deepEqual(values, { local: 'preserved', indexed: 'preserved' });
}
async function activateThroughOrdinaryReload(page) {
  root = current;
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.locator('script[src="/app-update.js"]').count(), 0, 'the first legacy reload should demonstrate the stale shell');
  await page.waitForFunction(() => window.__controllerChanges > 0, null, { timeout: 30000 });
  assert.equal(await page.locator('script[src="/app-update.js"]').count(), 0, 'activation must not silently discard the open page');
}
async function checkRole(page, user) {
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.locator('script[src="/app-update.js"]').waitFor({ state: 'attached' });
  if (user.role === 'coach') {
    await page.locator('.coach-welcome').waitFor();
    assert.match(new URL(page.url()).pathname, /^\/coach/);
  } else {
    await page.locator('.dashboard-shortcuts').waitFor();
    if (user.coachId !== null && user.role === 'student') await page.getByRole('heading', { name: 'روز آزمایشی شاگرد' }).waitFor();
    if (user.role === 'admin') assert.equal(new URL(page.url()).pathname, '/');
  }
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  for (const user of users.slice(0, 5)) {
    root = previous; workerVariant = 1;
    const context = await contextFor(user);
    const page = await oldPage(context);
    await putSentinels(page);
    await activateThroughOrdinaryReload(page);
    await checkRole(page, user);
    await page.goto(base + '/settings', { waitUntil: 'load' });
    const revision = page.getByText('شناسهٔ نسخهٔ رابط در این دستگاه:', { exact: false });
    await revision.waitFor();
    if (process.env.PWA_EXPECT_REVISION) assert.equal(await revision.locator('code').textContent(), process.env.PWA_EXPECT_REVISION);
    await checkSentinels(page);
    await context.close();
    console.log(`PASS: natural legacy upgrade, ${user.username}; role home, device version and localStorage/IndexedDB preserved`);
  }

  // A failed worker download keeps the old page and its data; the next ordinary reload can retry.
  root = previous; workerVariant = 1;
  const failingContext = await contextFor(users[0]);
  const failingPage = await oldPage(failingContext);
  await putSentinels(failingPage);
  const failureSeen = new Promise((resolve) => { installFailureObserved = resolve; });
  root = current; failInstall = true;
  await failingPage.reload({ waitUntil: 'load' });
  let failureTimer;
  await Promise.race([failureSeen, new Promise((_, reject) => { failureTimer = setTimeout(() => reject(new Error('No failed worker download observed')), 30000); })]);
  clearTimeout(failureTimer);
  await failingPage.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration && !registration.installing && !registration.waiting;
  }, null, { timeout: 30000 });
  assert.equal(await failingPage.evaluate(() => window.__controllerChanges), 0);
  assert.equal(await failingPage.locator('script[src="/app-update.js"]').count(), 0);
  await checkSentinels(failingPage);
  failInstall = false;
  await failingPage.waitForTimeout(3000); // Let the failed browser update finish before a later user reload.
  await activateThroughOrdinaryReload(failingPage);
  await checkRole(failingPage, users[0]);
  await checkSentinels(failingPage);
  await failingContext.close();
  console.log('PASS: failed worker download leaves old app and storage intact; a later normal reload retries');

  // Two old tabs: an actual unsaved programme editor must survive another tab's update.
  root = previous; workerVariant = 1;
  const context = await contextFor(users[5]);
  const editor = await oldPage(context, '/program/edit?mode=blank');
  const draft = editor.getByLabel('نام روز').first();
  await draft.fill('پیش‌نویس ذخیره‌نشده');
  await putSentinels(editor);
  const home = await oldPage(context);
  await activateThroughOrdinaryReload(home);
  await editor.waitForFunction(() => window.__controllerChanges > 0, null, { timeout: 30000 });
  assert.equal(await draft.inputValue(), 'پیش‌نویس ذخیره‌نشده', 'worker activation lost an unsaved programme draft');
  assert.match(new URL(editor.url()).pathname, /\/program\/edit/);

  const oldProgram = (await readdir(resolve(previous, 'assets'))).find((name) => /^Program-.*\.js$/.test(name));
  assert.ok(oldProgram, 'older lazy route must exist');
  const network = await fetch(`${base}/assets/${oldProgram}`);
  assert.equal(network.status, 404, 'a missing old JS file must not be served as HTML');
  const lazyResponse = home.waitForResponse((response) => response.url().endsWith(`/assets/${oldProgram}`));
  await home.evaluate(() => document.querySelector('a[href="/program"]').click());
  await home.getByRole('heading', { name: 'هفته‌ات را با برنامه پیش ببر.' }).waitFor();
  assert.equal((await lazyResponse).fromServiceWorker(), true, 'the old tab must actually load its old lazy route from the worker');
  const retained = await home.evaluate(async (path) => {
    const response = await fetch(path);
    return { ok: response.ok, type: response.headers.get('content-type'), text: (await response.text()).slice(0, 80) };
  }, `/assets/${oldProgram}`);
  assert.equal(retained.ok, true, 'old lazy route should remain available to an open old tab');
  assert.match(retained.type, /javascript/i);
  assert.doesNotMatch(retained.text, /<!doctype html/i);
  await checkSentinels(editor);
  console.log('PASS: two legacy tabs, real unsaved programme draft and previous hashed route preserved; missing asset is a 404');

  // A current-build tab gets an opt-in prompt on the next update, including reconnection checks.
  await checkRole(home, users[5]);
  await home.goto(base + '/program/edit?mode=blank', { waitUntil: 'load' });
  const newDraft = home.getByLabel('نام روز').first();
  await newDraft.fill('پیش‌نویس نسخهٔ تازه');
  const safeTab = await context.newPage();
  await checkRole(safeTab, users[5]);
  workerVariant = 2;
  await context.setOffline(true);
  await context.setOffline(false);
  await home.locator('.meety-update').waitFor({ state: 'visible', timeout: 30000 });
  await safeTab.locator('.meety-update').waitFor({ state: 'visible', timeout: 30000 });
  await home.setViewportSize({ width: 320, height: 700 });
  const bounds = await home.locator('.meety-update').boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320, 'update prompt must fit a 320px phone');
  assert.equal(await newDraft.inputValue(), 'پیش‌نویس نسخهٔ تازه');
  await home.getByRole('button', { name: 'بعداً' }).click();
  assert.equal(await newDraft.inputValue(), 'پیش‌نویس نسخهٔ تازه');
  await safeTab.bringToFront();
  await home.bringToFront();
  // Headless Chromium may not emit focus when switching virtual tabs.
  await home.evaluate(() => window.dispatchEvent(new Event('focus')));
  await home.locator('.meety-update').waitFor({ state: 'visible' });
  home.once('dialog', (dialog) => dialog.dismiss());
  await home.getByRole('button', { name: 'به‌روزرسانی', exact: true }).click();
  assert.equal(await newDraft.inputValue(), 'پیش‌نویس نسخهٔ تازه', 'cancelled confirmation must not reload');
  safeTab.once('dialog', (dialog) => dialog.accept());
  await Promise.all([safeTab.waitForNavigation({ waitUntil: 'load' }), safeTab.getByRole('button', { name: 'به‌روزرسانی', exact: true }).click()]);
  assert.equal(await safeTab.locator('meta[name="pwa-test-next-deployment"]').getAttribute('content'), 'online', 'a normal online reload should use the server shell');
  assert.equal(await draft.inputValue(), 'پیش‌نویس ذخیره‌نشده');
  await checkSentinels(home);
  console.log('PASS: reconnection prompts on both tabs; cancel preserves drafts, approval reloads just that tab using the online shell');

  // Offline and a 503 navigation use the cached public shell, not private API responses.
  await context.setOffline(true);
  const offline = await context.newPage();
  await offline.goto(base + '/', { waitUntil: 'load' });
  await offline.locator('.dashboard-shortcuts').waitFor();
  await checkSentinels(offline);
  await context.setOffline(false);
  serverUnavailable = true;
  await offline.goto(base + '/program', { waitUntil: 'load' });
  await offline.locator('script[src="/app-update.js"]').waitFor({ state: 'attached' });
  serverUnavailable = false;
  const privateEntries = await offline.evaluate(async () => {
    const keys = await caches.keys();
    const urls = (await Promise.all(keys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => request.url)))).flat();
    return urls.filter((url) => new URL(url).pathname.startsWith('/api/'));
  });
  assert.deepEqual(privateEntries, []);
  assert.equal(await draft.inputValue(), 'پیش‌نویس ذخیره‌نشده');
  console.log('PASS: offline and 503 navigation fallback; account API responses are not cached');
  await context.close();

  // Reproduce headers arriving while the programme response body never completes.
  root = current; workerVariant = 1; stallProgramBody = true;
  const slowContext = await contextFor(users[0]);
  const slowPage = await slowContext.newPage();
  await slowPage.goto(base + '/', { waitUntil: 'load' });
  await slowPage.getByRole('heading', { name: 'در حال دریافت برنامه از مربی…' }).waitFor();
  await slowPage.getByText(/ارتباط بیشتر از معمول طول کشیده است/).waitFor({ timeout: 12000 });
  await slowPage.getByRole('alert').getByText('دریافت برنامه انجام نشد').waitFor({ timeout: 30000 });
  stallProgramBody = false;
  await slowPage.getByRole('button', { name: 'تلاش دوباره' }).click();
  await slowPage.getByRole('heading', { name: 'روز آزمایشی شاگرد' }).waitFor();
  await slowContext.close();
  console.log('PASS: stalled programme response body shows a slow warning, then an error; retry loads the assigned programme');

  // The deployed predecessor already has update prompts. A still-open old draft must
  // remain untouched while a separate tab picks up the new build normally.
  if (process.env.PWA_COMPAT_DIST) {
    root = resolve(process.env.PWA_COMPAT_DIST); workerVariant = 1;
    const installed = await contextFor(users[5]);
    const existingEditor = await installed.newPage();
    await existingEditor.goto(base + '/program/edit?mode=blank', { waitUntil: 'load' });
    await existingEditor.evaluate(() => navigator.serviceWorker.ready);
    await existingEditor.reload({ waitUntil: 'load' });
    await existingEditor.waitForFunction(() => !!navigator.serviceWorker.controller);
    assert.equal(await existingEditor.locator('script[src="/app-update.js"]').count(), 1, 'predecessor must have safe update prompts');
    const oldInput = existingEditor.getByLabel('نام روز').first();
    await oldInput.fill('پیش‌نویس نسخهٔ نصب‌شده');
    await putSentinels(existingEditor);
    root = current;
    const freshTab = await installed.newPage();
    await freshTab.goto(base + '/program/edit?mode=blank', { waitUntil: 'load' });
    const freshInput = freshTab.getByLabel('نام روز').first();
    await freshInput.fill('پیش‌نویس نسخهٔ تازه');
    await freshTab.getByText(/نسخهٔ موقت فقط در همین زبانه/).waitFor();
    await existingEditor.locator('.meety-update').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await oldInput.inputValue(), 'پیش‌نویس نسخهٔ نصب‌شده');
    existingEditor.once('dialog', (dialog) => dialog.dismiss());
    await existingEditor.getByRole('button', { name: 'به‌روزرسانی', exact: true }).click();
    assert.equal(await oldInput.inputValue(), 'پیش‌نویس نسخهٔ نصب‌شده', 'cancelling must preserve the predecessor draft');
    await checkSentinels(existingEditor);
    await installed.close();
    console.log('PASS: direct upgrade from the installed update-aware release; old unsaved draft survives cancellation, new tab uses recovery, storage preserved');
  }
} finally {
  serverUnavailable = false;
  failInstall = false;
  stallProgramBody = false;
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
