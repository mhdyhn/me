import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Builds dist/meety-offline.html: one HTML file with the app JS and CSS inlined. Everything here is synchronous on purpose. String.replace does not await a
// Promise returned from its callback, so an async callback writes "[object Promise]"
// into the page in place of the script (this is how the first version broke the app).
const dist = resolve('dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsFiles = new Set(readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js')));

html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script[^>]+src="\/assets\/([^"]+\.js)"[^>]*><\/script>/g, (_, file) => {
  if (!jsFiles.has(file)) return '';
  const body = readFileSync(join(dist, 'assets', file), 'utf8');
  if (body.includes('</script')) throw new Error(`${file} contains "</script", it cannot be inlined`);
  return `<script type="module">${body}</script>`;
});
const linkRe = /<link[^>]+href="\/assets\/([^"]+\.css)"[^>]*>/g;
for (const match of [...html.matchAll(linkRe)]) {
  const css = readFileSync(join(dist, 'assets', match[1]), 'utf8');
  html = html.replace(match[0], `<style>${css}</style>`);
}
html = html.replace(/<link[^>]+href="\/manifest\.webmanifest"[^>]*>/g, '');
html = html.replaceAll('/assets/', 'data-ignore-assets/');
html = html.replace('dist/index.html', 'meety-offline.html');
writeFileSync(join(dist, 'meety-offline.html'), html, 'utf8');
console.log('Created dist/meety-offline.html');
