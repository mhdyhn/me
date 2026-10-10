import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { exercises } from './exercises';
import { motions } from '../motion/library';

const modelPath = resolve(process.cwd(), 'public/models/human.glb');
const licensePath = resolve(process.cwd(), 'public/models/README.md');

interface GlbDocument {
  animations?: unknown[];
  extensionsUsed?: string[];
  scene?: number;
  scenes?: { extras?: { statureM?: number } }[];
  skins?: { joints?: unknown[] }[];
  bufferViews?: {
    extensions?: {
      EXT_meshopt_compression?: {
        byteOffset?: number;
        byteLength: number;
        count: number;
        byteStride: number;
        mode: string;
        filter?: string;
        buffer: number;
      };
    };
  }[];
}

describe('licensed 3D reference model', () => {
  it('is a valid, pinned GLB 2 file with a skinned human and no exercise animation', () => {
    const bytes = readFileSync(modelPath);
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF');
    expect(bytes.readUInt32LE(4)).toBe(2);
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    expect(bytes.toString('ascii', 16, 20)).toBe('JSON');

    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GlbDocument;
    expect(document.skins?.[0]?.joints).toHaveLength(53);
    expect(document.animations ?? []).toHaveLength(0);
    expect(document.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(document.scenes?.[document.scene ?? 0]?.extras?.statureM).toBeCloseTo(1.844, 2);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'b04500155d110fed366f5ce8c13231797f1796c8146311401f17e16dd11cfede',
    );
  });

  it('decodes every Meshopt-compressed mesh buffer used by the model', async () => {
    const bytes = readFileSync(modelPath);
    const jsonLength = bytes.readUInt32LE(12);
    const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GlbDocument;
    const binHeaderOffset = 20 + jsonLength;
    const binLength = bytes.readUInt32LE(binHeaderOffset);
    expect(bytes.readUInt32LE(binHeaderOffset + 4)).toBe(0x004e4942);
    const binaryChunk = bytes.subarray(binHeaderOffset + 8, binHeaderOffset + 8 + binLength);
    const compressedViews = (document.bufferViews ?? [])
      .map((view) => view.extensions?.EXT_meshopt_compression)
      .filter((view) => view !== undefined);

    await MeshoptDecoder.ready;
    expect(MeshoptDecoder.supported).toBe(true);
    const decodedLengths = await Promise.all(compressedViews.map(async (view) => {
      if (!view || view.buffer !== 0) throw new Error('Unexpected Meshopt buffer reference.');
      const source = binaryChunk.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
      const decoded = await MeshoptDecoder.decodeGltfBufferAsync(
        view.count,
        view.byteStride,
        source,
        view.mode,
        view.filter,
      );
      expect(decoded.byteLength).toBe(view.count * view.byteStride);
      return decoded.byteLength;
    }));

    expect(compressedViews).toHaveLength(37);
    expect(decodedLengths.reduce((sum, length) => sum + length, 0)).toBe(617120);
  });

  it('records the CC0 provenance and gives every exercise its own movement loop', () => {
    const license = readFileSync(licensePath, 'utf8');
    expect(license).toContain('CC0 1.0');
    expect(license).toContain('78a03f1bc6b9e832b75c97e66b3f185623c96a81');

    expect(exercises).toHaveLength(33); // 32 repo exercises + Dumbbell Biceps Curl (brief)
    expect(exercises.every((exercise) => exercise.modelAsset === '/models/human.glb')).toBe(true);
    // The 3D viewer plays these loops, so every exercise needs one that exists.
    const ids = exercises.map((exercise) => exercise.motionId);
    expect(ids.every((id) => typeof id === 'string' && id in motions)).toBe(true);
    expect(new Set(ids).size).toBe(exercises.length);
  });

  it('keeps the loops and the written steps in the same order', () => {
    for (const exercise of exercises) {
      const motion = motions[exercise.motionId!]!;
      expect(motion.keys, exercise.id).toHaveLength(exercise.movementPhases.length);
      expect(motion.name, exercise.id).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
