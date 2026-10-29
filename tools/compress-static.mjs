// Precompress public text assets once at build time, not on every request.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { gzipSync, constants } from 'node:zlib';

const root = resolve('dist');
const compressible = new Set(['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.glb']);
let count = 0;
let originalBytes = 0;
let compressedBytes = 0;
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await visit(file);
    else if (entry.isFile() && compressible.has(extname(entry.name))) {
      const source = await readFile(file);
      if (source.length < 1024) continue;
      const compressed = gzipSync(source, { level: constants.Z_BEST_COMPRESSION });
      if (compressed.length >= source.length) continue;
      await writeFile(`${file}.gz`, compressed);
      count += 1;
      originalBytes += source.length;
      compressedBytes += compressed.length;
    }
  }
}
await visit(root);
console.log(`Precompressed ${count} public assets: ${Math.round(originalBytes / 1024)} KiB → ${Math.round(compressedBytes / 1024)} KiB (gzip).`);
