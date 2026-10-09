import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MODEL_PATH = resolve(process.cwd(), 'public/models/human.glb');

/**
 * The shipped GLB as the browser sees it, with its textures dropped: jsdom cannot
 * decode webp and none of the tests need them. Everything else — hierarchy, skin,
 * joints, materials — is the file the app downloads.
 */
export async function loadBrowserScene(path = MODEL_PATH): Promise<GLTF> {
  const raw = readFileSync(path);
  const jsonLength = raw.readUInt32LE(12);
  const json = JSON.parse(raw.subarray(20, 20 + jsonLength).toString('utf-8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  json.materials = (json.materials ?? []).map(
    ({ name, pbrMetallicRoughness }: { name: string; pbrMetallicRoughness?: { baseColorFactor?: number[] } }) => ({
      name,
      pbrMetallicRoughness: { baseColorFactor: pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1] },
    }),
  );
  const body = Buffer.from(JSON.stringify(json));
  const padded = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
  const rest = raw.subarray(20 + jsonLength); // the BIN chunk, header included
  const total = 12 + 8 + padded.length + rest.length;
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  const glb = Buffer.concat([header, padded, rest]);
  // jsdom owns the ArrayBuffer the loader checks against, so hand it a copy of its
  // own realm instead of the Node buffer's backing store.
  const bytes = new Uint8Array(glb).slice().buffer;
  const loader = new GLTFLoader();
  // The same decoder the viewer installs before it loads the shipped file.
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise<GLTF>((resolvePromise, reject) =>
    loader.parse(bytes, '', (gltf) => resolvePromise(gltf), reject),
  );
}
