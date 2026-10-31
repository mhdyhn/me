/**
 * Render every pose in poses.mjs to SVG, and build the animated guide of the same moves.
 *
 *   node tools/exercise-figures/build.mjs [outDir]
 *
 * Default outDir: public/exercise-images. Files: <exercise-id>-<start|main>.svg
 * The animated guide is written to public/exercise-motion/<exercise-id>.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPose } from './render.mjs';
import { POSES } from './poses.mjs';
import { buildMotion } from './motion.mjs';

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

// The animated guide is a separate pack: the app loads it only for the movement in view.
const motionDir = resolve(root, 'public', 'exercise-motion');
mkdirSync(motionDir, { recursive: true });
let motions = 0;
for (const [id, states] of Object.entries(POSES)) {
  const motion = buildMotion(states);
  if (!motion) continue;
  writeFileSync(join(motionDir, `${id}.json`), `${JSON.stringify(motion)}\n`);
  motions++;
}
console.log(`wrote ${count} SVG files to ${outDir} and ${motions} motion files to ${motionDir}`);
