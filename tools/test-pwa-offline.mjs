// Built PWA smoke test, including all offline SVGs and a previously viewed photo.
// Optionally pass PWA_PREVIOUS_DIST to verify an actual service-worker upgrade.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { serveStatic } from '../server/static.ts';

const current = resolve('dist');
const previous = process.env.PWA_PREVIOUS_DIST ? resolve(process.env.PWA_PREVIOUS_DIST) : null;
let root = previous ?? current;
const server = createServer((request, response) => {
  if (!serveStatic(root, new URL(request.url ?? '/', 'http://localhost').pathname, response, request)) {
    response.writeHead(404); response.end();
  }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const requests = [];
  context.on('request', (request) => requests.push(request.url()));
  const page = await context.newPage();
  await page.goto(base, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (previous) {
    root = current;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error('Previous worker was not registered');
      await registration.update();
      const worker = registration.installing ?? registration.waiting;
      if (worker && worker.state !== 'activated') {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Worker upgrade timed out')), 30000);
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') { clearTimeout(timer); resolve(); }
            if (worker.state === 'redundant') { clearTimeout(timer); reject(new Error('Worker upgrade failed')); }
          });
        });
      }
    });
  }
  await page.reload({ waitUntil: 'load' });
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) throw new Error('Service worker does not control the page');
  const cache = await page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat();
    return { entries: urls.length, illustrationFiles: urls.filter((url) => url.includes('/exercise-images/')).length, packs: urls.filter((url) => url.includes('/exercise-figures.json')).length };
  });
  if (cache.illustrationFiles !== 0 || cache.packs !== 1) throw new Error(`Unexpected precache contents: ${JSON.stringify(cache)}`);
  if (!previous && requests.some((url) => url.includes('/exercise-images/'))) throw new Error('Initial install downloaded individual SVGs');
  if (requests.some((url) => /\/models\/|vendor-three-|ExerciseModel3D-/.test(url))) throw new Error('Optional 3D assets were fetched before use');
  const model = '/models/push-up-3f77e479.glb';
  const threeFile = (await readdir('dist/assets')).find((name) => /^vendor-three-.*\.js$/.test(name));
  if (!threeFile) throw new Error('3D code chunk not found');
  const codePath = `/assets/${threeFile}`;
  if (!(await page.evaluate(async ([modelPath, jsPath]) => (await fetch(modelPath)).ok && (await fetch(jsPath)).ok, [model, codePath]))) throw new Error('Public 3D assets did not load online');
  await page.waitForFunction(async ([modelPath, jsPath]) => !!(await caches.match(modelPath)) && !!(await caches.match(jsPath)), [model, codePath]);
  const viewedPhoto = '/exercise-photos/push-up-start.jpg';
  if (!(await page.evaluate(async (path) => (await fetch(path)).ok, viewedPhoto))) throw new Error('Photo did not load online');
  // Ensure Workbox finished writing its runtime cache before the offline phase.
  await page.waitForFunction(async (path) => !!(await caches.match(path)), viewedPhoto);
  await context.setOffline(true);
  const files = (await readdir('public/exercise-images')).filter((name) => name.endsWith('.svg')).sort();
  const result = await page.evaluate(async ({ names, modelPath, jsPath }) => {
    const figures = await Promise.all(names.map(async (name) => {
      try { const response = await fetch(`/exercise-images/${name}`); return { name, status: response.status, body: await response.text() }; }
      catch { return { name, status: 0, body: '' }; }
    }));
    let photoAvailable = false;
    try { photoAvailable = (await fetch('/exercise-photos/push-up-start.jpg')).ok; } catch {}
    let privateApiWasCached = false;
    try { privateApiWasCached = (await fetch('/api/me/program')).ok; } catch {}
    let modelHash = '';
    let codeAvailable = false;
    try {
      const bytes = await (await fetch(modelPath)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      modelHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      codeAvailable = (await fetch(jsPath)).ok;
    } catch {}
    return { figures, photoAvailable, privateApiWasCached, modelHash, codeAvailable };
  }, { names: files, modelPath: model, jsPath: codePath });
  for (const figure of result.figures) {
    if (figure.status !== 200 || figure.body !== await readFile(`public/exercise-images/${figure.name}`, 'utf8')) throw new Error(`Offline SVG mismatch: ${figure.name}`);
  }
  if (!result.photoAvailable || result.privateApiWasCached) throw new Error('Offline photo or private API cache behavior changed');
  const modelHash = createHash('sha256').update(await readFile('public' + model)).digest('hex');
  if (result.modelHash !== modelHash || !result.codeAvailable) throw new Error('Previously viewed 3D assets are unavailable offline');
  await page.goto(base + '/program', { waitUntil: 'domcontentloaded' });
  if (!(await page.locator('#root').count())) throw new Error('Offline navigation fallback failed');
  console.log(`PASS: ${files.length} exact SVGs, a previously viewed photo and optional 3D assets offline; private API not cached; ${cache.entries} precache entries; ${previous ? 'previous worker upgraded' : 'no SVG requests during install'}.`);
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
