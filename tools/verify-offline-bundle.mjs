import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const path = 'dist/meety-offline.html';
if (!existsSync(path)) {
  console.error(`FAIL: ${path} not found. Run npm run build:offline first.`);
  process.exit(2);
}
const html = await readFile(path, 'utf8');
const info = await stat(path);
const checks = [
  ['embedded GLB data URI', html.includes('data:model/gltf-binary;base64,')],
  ['no external module JS entrypoint', !/<script[^>]+src=["']https?:\/\//i.test(html) && !/<script[^>]+src=["']\/assets\//i.test(html)],
  ['no external CSS entrypoint', !/<link[^>]+href=["']https?:\/\//i.test(html) && !/<link[^>]+href=["']\/assets\//i.test(html)],
  ['viewport metadata present', /name=["']viewport["']/i.test(html)],
  ['inline app script present (not an empty or [object Promise] placeholder)', /<script type="module">[\s\S]{100000,}?<\/script>/.test(html) && !html.includes('[object Promise]')],
];
console.log(`Bundle: ${path}`);
console.log(`Size: ${info.size} bytes (${(info.size / 1024 / 1024).toFixed(2)} MiB)`);
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
console.log('PASS: basic single-file packaging checks. This is not a full airplane-mode browser test.');
