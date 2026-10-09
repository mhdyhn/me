import { readFile, readdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const libraryPath = 'src/motion/library.ts';
const canvasPath = 'src/components/ExerciseModelCanvas.tsx';
const modelPath = 'public/models/human.glb';
const expected = [
  ['barbell-squat', 'اسکوات پشت با هالتر'],
  ['barbell-bench-press', 'پرس سینه با هالتر'],
  ['lat-pulldown', 'زیربغل سیم‌کش'],
  ['romanian-deadlift', 'ددلیفت رومانیایی'],
  ['leg-press', 'پرس پا'],
];

const library = await readFile(libraryPath, 'utf8');
const canvas = await readFile(canvasPath, 'utf8');
const modelExists = await access(modelPath, constants.R_OK).then(() => true, () => false);
async function listTests(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listTests(file)));
    else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) out.push(file);
  }
  return out;
}
const testFiles = [...(await listTests('tests')), ...(await listTests('src'))].sort();

console.log('=== Motion source preflight (static; no model rendering) ===');
console.log(`Source catalogue: ${libraryPath}`);
for (const [id, label] of expected) {
  const found = library.includes(`'${id}'`) && library.includes(label);
  console.log(`${found ? 'PASS' : 'FAIL'}: ${label} (${id}) ${found ? 'present in source' : 'not found'}`);
}
const hasClipPlayback = /\bAnimationMixer\b|\bAnimationClip\b|\bclipAction\s*\(/.test(`${library}\n${canvas}`);
console.log(`${hasClipPlayback ? 'INFO' : 'NOTE'}: ${hasClipPlayback ? 'Three.js clip playback symbols detected' : 'no Three.js AnimationMixer/clipAction path detected; the viewer is using the procedural pose sampler'}`);
console.log(`${modelExists ? 'PASS' : 'BLOCKED'}: model file ${modelExists ? 'exists' : 'missing'} (${modelPath})`);
console.log(`Test files found under tests/ and src/: ${testFiles.length}`);
for (const file of testFiles) console.log(`  - ${file}`);
console.log('');
console.log('Interpretation: this check confirms source wiring only. It cannot certify realistic form, implement contact, or visual accuracy. Those require the actual GLB, installed dependencies, executed tests, and front/side review of rendered poses.');

if (expected.some(([id, label]) => !library.includes(`'${id}'`) || !library.includes(label))) {
  process.exitCode = 1;
}
