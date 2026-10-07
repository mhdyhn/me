import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3, type Object3D } from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildMotionRig, poseRig, type MotionRig } from '../src/motion/modelRig';
import { createMotionState, sampleMotion } from '../src/motion/sampler';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton, type RestSkeleton } from '../src/motion/skeleton';
import type { MotionDefinition } from '../src/motion/types';
import { motions } from '../src/motion/library';

/**
 * The shipped GLB with its textures dropped: jsdom cannot decode webp, and the
 * rig does not need them. Everything else — hierarchy, skin, joints — is the
 * file the browser downloads.
 */
const loadScene = async () => {
  const raw = readFileSync('public/models/human.glb');
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
  // jsdom owns the ArrayBuffer the loader checks against, so hand it a copy of
  // its own realm instead of the Node buffer's backing store.
  const bytes = new Uint8Array(glb).slice().buffer;
  const loader = new GLTFLoader();
  // Same decoder the viewer installs before it loads the shipped file.
  loader.setMeshoptDecoder(MeshoptDecoder);
  return new Promise<GLTF>((resolve, reject) =>
    loader.parse(
      bytes,
      '',
      (gltf) => resolve(gltf),
      reject,
    ),
  );
};


/** The rest pose straight from the file, with no loaded scene involved. */
const offlineRest = (): RestSkeleton =>
  collectRestSkeleton(
    buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb')))).scene,
  );

const PHASES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
const POSITION_TOLERANCE = 0.002;
const ROTATION_TOLERANCE = 0.005;

/** Compares every bone of one movement between the loaded scene and the sampler. */
const comparePoses = (
  scene: Object3D,
  rig: MotionRig,
  offline: RestSkeleton,
  motion: MotionDefinition,
): void => {
  const state = createMotionState(offline, motion);
  for (const phase of PHASES) {
    poseRig(rig, phase);
    sampleMotion(state, phase);
    scene.updateMatrixWorld(true);
    for (const [name, expected] of state.worldPosition) {
      const bone = rig.bones.get(name);
      if (!bone) throw new Error(`${motion.id}: the loaded scene has no bone ${name}`);
      const posed = new Vector3();
      const posedRotation = new Quaternion();
      bone.getWorldPosition(posed);
      bone.getWorldQuaternion(posedRotation);
      expect(posed.distanceTo(expected), `${motion.id} ${name} at ${phase}`).toBeLessThan(POSITION_TOLERANCE);
      expect(
        posedRotation.angleTo(state.worldQuaternion.get(name)!),
        `${motion.id} ${name} rotation at ${phase}`,
      ).toBeLessThan(ROTATION_TOLERANCE);
    }
  }
};

describe('model path', () => {
  /**
   * The viewer plays the loop on the scene GLTFLoader hands the browser, while every
   * measurement in the repository comes from the sampler's own forward kinematics. If
   * those disagree, the app shows a pose nobody reviewed. They did: rotations were
   * written in the sampler's world frame onto bones that live in a parent frame, so
   * every joint below the first one swung around the wrong axis.
   */
  it('poses every movement in the library exactly like the offline sampler', async () => {
    const gltf = await loadScene();
    const offline = offlineRest();
    for (const motion of Object.values(motions)) {
      const rig = buildMotionRig(gltf.scene, motion);
      comparePoses(gltf.scene, rig, offline, motion);
    }
  });

  /**
   * One loaded scene serves every movement on a page. The rest pose must therefore
   * survive a movement being played on it, otherwise the next movement starts from
   * the last frame of the previous one — the bench press used to begin at the bottom
   * of a squat.
   */
  it('re-anchors a scene a movement was played on', async () => {
    const gltf = await loadScene();
    const offline = offlineRest();
    const squat = buildMotionRig(gltf.scene, motions['barbell-squat']!);
    poseRig(squat, 0.5);
    gltf.scene.updateMatrixWorld(true);
    expect(squat.bones.get('Root')!.position.length(), 'the squat really moved the figure').toBeGreaterThan(0.001);

    const press = buildMotionRig(gltf.scene, motions['barbell-bench-press']!);
    for (const [name, rest] of offline.bones) {
      const collected = press.rest.bones.get(name)!;
      expect(collected.worldPosition.distanceTo(rest.worldPosition), `rest position ${name}`).toBeLessThan(POSITION_TOLERANCE);
      expect(collected.worldQuaternion.angleTo(rest.worldQuaternion), `rest rotation ${name}`).toBeLessThan(ROTATION_TOLERANCE);
    }
  });
});
