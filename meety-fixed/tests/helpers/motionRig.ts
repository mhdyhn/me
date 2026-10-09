import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRigFromGlb } from './glbRig';
import { collectRestSkeleton, type RestSkeleton } from '../../src/motion/skeleton';

export const MODEL_PATH = resolve(process.cwd(), 'public/models/human.glb');

export interface LoadedRig {
  rest: RestSkeleton;
  names: string[];
}

let cached: LoadedRig | null = null;

/** Rest skeleton of the shipped CC0 model, rebuilt from the GLB without GLTFLoader. */
export function loadRig(): LoadedRig {
  if (!cached) {
    const bytes = readFileSync(MODEL_PATH);
    const { root, bones } = buildRigFromGlb(new Uint8Array(bytes));
    const rest = collectRestSkeleton(root);
    cached = { rest, names: [...bones.keys()] };
    for (const name of rest.order) {
      if (!bones.has(name)) throw new Error(`Bone ${name} missing from the GLB node graph`);
    }
  }
  return cached;
}

/** Writes JSON for the offline pose preview when MOTION_DUMP points at a directory. */
export function dumpJson(name: string, data: unknown): void {
  const directory = process.env.MOTION_DUMP;
  if (!directory) return;
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, `${name}.json`), JSON.stringify(data, null, 1));
}

const round = (value: number) => Math.round(value * 10000) / 10000;

export function roundVector(vector: { x: number; y: number; z: number }): [number, number, number] {
  return [round(vector.x), round(vector.y), round(vector.z)];
}
