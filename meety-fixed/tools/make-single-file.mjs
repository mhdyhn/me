import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const dist = resolve('dist');
const htmlPath = join(dist, 'index.html');
let html = await readFile(htmlPath, 'utf8');
const entries = await readdir(join(dist, 'assets'));
const jsFiles = new Set(entries.filter((name) => name.endsWith('.js')));

const replaceModel = async (content) => {
  const modelPath = join(resolve('public'), 'models', 'human.glb');
  try {
    const bytes = await readFile(modelPath);
    const data = `data:model/gltf-binary;base64,${bytes.toString('base64')}`;
    return content.replaceAll('/models/human.glb', data);
  } catch {
    return content;
  }
};

html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script[^>]+src="\/assets\/([^"]+\.js)"[^>]*><\/script>/g, async (_, file) => {
  return jsFiles.has(file) ? `<script type="module">${await replaceModel(await readFile(join(dist, 'assets', file), 'utf8'))}</script>` : '';
});
const linkRe = /<link[^>]+href="\/assets\/([^"]+\.css)"[^>]*>/g;
for (const match of [...html.matchAll(linkRe)]) {
  const css = await readFile(join(dist, 'assets', match[1]), 'utf8');
  html = html.replace(match[0], `<style>${css}</style>`);
}
html = html.replace(/<link[^>]+href="\/manifest\.webmanifest"[^>]*>/g, '');
html = html.replaceAll('/assets/', 'data-ignore-assets/');
html = html.replace('dist/index.html', 'meety-offline.html');
await writeFile(join(dist, 'meety-offline.html'), html, 'utf8');
console.log('Created dist/meety-offline.html');
