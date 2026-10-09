import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const path = 'public/models/human.glb';
const expectedSha256 = 'b04500155d110fed366f5ce8c13231797f1796c8146311401f17e16dd11cfede';

if (!existsSync(path)) {
  console.error(`MODEL MISSING: ${path}`);
  console.error('Run `npm run fetch:model` from the project root on a computer with internet access.');
  process.exit(2);
}

const bytes = await readFile(path);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const magic = bytes.toString('ascii', 0, 4);
const version = bytes.readUInt32LE(4);
const declaredLength = bytes.readUInt32LE(8);

if (magic !== 'glTF') throw new Error(`Invalid GLB magic: ${JSON.stringify(magic)}`);
if (version !== 2) throw new Error(`Expected GLB version 2, got ${version}`);
if (declaredLength !== bytes.length) {
  throw new Error(`GLB length mismatch: header=${declaredLength}, actual=${bytes.length}`);
}
if (bytes.length < 20) throw new Error('GLB is too short to contain a JSON chunk.');

const jsonLength = bytes.readUInt32LE(12);
const jsonType = bytes.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error('The first GLB chunk is not a JSON chunk.');
if (20 + jsonLength > bytes.length) throw new Error('GLB JSON chunk exceeds the file length.');

const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength).replace(/\u0000+$/g, '').trim());
const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
const skins = Array.isArray(gltf.skins) ? gltf.skins : [];
const nodes = Array.isArray(gltf.nodes) ? gltf.nodes : [];
const meshes = Array.isArray(gltf.meshes) ? gltf.meshes : [];
const skinnedNodes = nodes.filter((node) => Number.isInteger(node.skin) && Number.isInteger(node.mesh)).length;
const hashOK = sha256 === expectedSha256;

console.log(`Model: ${path}`);
console.log(`Bytes: ${bytes.length} (${(bytes.length / 1024).toFixed(1)} KiB)`);
console.log(`Format: GLB ${version}; meshes=${meshes.length}; skins=${skins.length}; skinned nodes=${skinnedNodes}`);
console.log(`Animation clips embedded: ${animations.length}${animations.length ? ` (${animations.map((clip) => clip.name || '(unnamed)').join(', ')})` : ''}`);
console.log(`SHA-256: ${sha256}`);
console.log(`Expected SHA-256: ${expectedSha256}`);
if (!hashOK) {
  console.error('FAIL: model checksum does not match the pinned CC0 asset.');
  process.exit(3);
}
console.log('PASS: GLB structure and pinned SHA-256 verified.');
