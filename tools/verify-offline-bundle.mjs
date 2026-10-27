import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const path = 'dist/meety-offline.html';
if (!existsSync(path)) {
  console.error(`FAIL: ${path} not found. Run npm run build:offline first.`);
  process.exit(2);
}
const html = await readFile(path, 'utf8');
const info = await stat(path);
const links = html.match(/<link\b[^>]*>/gi) ?? [];
const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1]);
const checks = [
  ['no 3D model embedded (the app has no model asset)', !html.includes('data:model/gltf-binary')],
  ['no external module JS entrypoint', !/<script[^>]+src=["'](?:https?:\/\/|\/assets\/)/i.test(html)],
  ['no external stylesheet entrypoint', !links.some((link) => /\brel=["']stylesheet["']/i.test(link))],
  ['CSS build assets are inlined', styles.length > 0 && !styles.some((style) => /url\(["']?\/assets\//i.test(style))],
  ['offline document does not preconnect to a server', !links.some((link) => /\brel=["'](?:preconnect|dns-prefetch)["']/i.test(link))],
  ['viewport metadata present', /name=["']viewport["']/i.test(html)],
  ['inline app script present (not an empty or [object Promise] placeholder)', /<script type="module">[\s\S]{100000,}?<\/script>/.test(html) && !html.includes('[object Promise]')],
];
console.log(`Bundle: ${path}`);
console.log(`Size: ${info.size} bytes (${(info.size / 1024 / 1024).toFixed(2)} MiB)`);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log('PASS: basic single-file packaging checks. This is not a full airplane-mode browser test.');
