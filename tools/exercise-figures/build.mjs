/**
 * Render every pose in poses.mjs to SVG.
 *
 *   node tools/exercise-figures/build.mjs [outDir]
 *
 * Default outDir: public/exercise-images. Files: <exercise-id>-<start|main>.svg
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPose } from './render.mjs';
import { POSES } from './poses.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const outDir = resolve(process.argv[2] ?? join(root, 'public', 'exercise-images'));
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const [id, states] of Object.entries(POSES)) {
  for (const [state, pose] of Object.entries(states)) {
    const file = join(outDir, `${id}-${state}.svg`);
    writeFileSync(file, renderPose(pose, { label: `${id} (${state})` }));
    count++;
  }
}
console.log(`wrote ${count} SVG files to ${outDir}`);
