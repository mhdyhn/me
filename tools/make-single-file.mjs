import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

// Inline the built JS, CSS and CSS assets synchronously; String.replace cannot await promises.
const dist = resolve('dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const jsFiles = new Set(readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js')));
const mime = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

function inlineFile(path) {
  const contentType = mime[extname(path).toLowerCase()];
  if (!contentType) throw new Error(`Cannot inline unsupported asset: ${path}`);
  return `data:${contentType};base64,${readFileSync(join(dist, path)).toString('base64')}`;
}

html = html.replace(/<link[^>]+rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script[^>]+src="\/assets\/([^"]+\.js)"[^>]*><\/script>/g, (_, file) => {
  if (!jsFiles.has(file)) throw new Error(`Missing script asset: ${file}`);
  const body = readFileSync(join(dist, 'assets', file), 'utf8');
  if (body.includes('</script')) throw new Error(`${file} contains "</script", it cannot be inlined`);
  return `<script type="module">${body}</script>`;
});
const linkRe = /<link[^>]+href="\/assets\/([^"]+\.css)"[^>]*>/g;
for (const match of [...html.matchAll(linkRe)]) {
  let css = readFileSync(join(dist, 'assets', match[1]), 'utf8');
  css = css.replace(/url\((['"]?)\/assets\/([^/'"()?#]+)\1\)/g, (_, _quote, file) => `url("${inlineFile(`assets/${file}`)}")`);
  html = html.replace(match[0], `<style>${css}</style>`);
}
html = html.replace(/<link[^>]+href="\/manifest\.webmanifest"[^>]*>/g, '');
// These network hints are not useful when an HTML file is opened offline.
html = html.replace(/<link[^>]+rel="(?:preconnect|dns-prefetch)"[^>]*>/g, '');
html = html.replace(/href="\/(brand-mark\.svg|icons\/icon-192\.png|apple-touch-icon\.png)"/g, (_, path) => `href="${inlineFile(path)}"`);
writeFileSync(join(dist, 'meety-offline.html'), html, 'utf8');
console.log('Created dist/meety-offline.html');
