/**
 * Fits a seat and backrest under the seated movements (dev tool, not shipped).
 *
 *   npx vite-node tools/seat-fit.ts                  # every seated movement
 *   npx vite-node tools/seat-fit.ts seated-cable-row
 *
 * The pad is placed under the hips and the backrest lies along the trunk, using
 * the pose the loop actually holds, so the printed numbers can be pasted into
 * `src/motion/library.ts` as a `seatFixture`.
 */
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState, sampleMotion, type MotionState } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const { scene } = buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb'))));
const rest = collectRestSkeleton(scene);

/** Movements whose loop sits on a machine seat, with the trunk upright. */
const SEATED = [
  'shoulder-press',
  'leg-extension',
  'leg-curl',
  'seated-calf-raise',
  'lat-pulldown',
  'neutral-grip-lat-pulldown',
  'seated-cable-row',
];

/** Bent-over movements braced on a chest pad instead of a seat. */
const CHEST_PAD = ['reverse-fly', 'machine-row'];

const round = (value: number) => Math.round(value * 1000) / 1000;
const triple = (v: Vector3) => `[${round(v.x)}, ${round(v.y)}, ${round(v.z)}] as [number, number, number]`;

function fitPad(state: MotionState, id: string) {
  const chest = new Vector3();
  const axis = new Vector3();
  const samples = 12;
  let pitch = 0;
  for (let step = 0; step < samples; step += 1) {
    sampleMotion(state, step / samples);
    const hips = state.worldPosition.get('pelvis')!;
    const torso = state.worldPosition.get('spine_03')!;
    chest.add(torso.clone().multiplyScalar(1 / samples));
    const direction = torso.clone().sub(hips).normalize();
    axis.add(direction.clone().multiplyScalar(1 / samples));
    pitch += (Math.atan2(direction.z, direction.y) * 180) / Math.PI / samples;
  }
  axis.normalize();
  // The pad sits just in front of the chest, tilted with the trunk.
  const pad = chest.clone().addScaledVector(axis, 0.02);
  const forward = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(1, 0, 0), (pitch * Math.PI) / 180);
  const centre = pad.clone().addScaledVector(forward, 0.16);
  console.log(
    `${id}\n  chest pad  centre ${triple(centre)} size [0.44, 0.34, 0.1] tilt ${round(pitch)}`,
  );
}

function fit(state: MotionState, id: string) {
  const pelvis = new Vector3();
  const trunk = new Vector3();
  const samples = 12;
  let pitch = 0;
  for (let step = 0; step < samples; step += 1) {
    sampleMotion(state, step / samples);
    const hips = state.worldPosition.get('pelvis')!;
    const chest = state.worldPosition.get('spine_03')!;
    pelvis.add(hips.clone().multiplyScalar(1 / samples));
    const axis = chest.clone().sub(hips).normalize();
    trunk.add(axis.clone().multiplyScalar(1 / samples));
    // How far the trunk leans forward (positive = forward, around world X).
    pitch += (Math.atan2(axis.z, axis.y) * 180) / Math.PI / samples;
  }
  trunk.normalize();
  // Pad just under the hips, its front edge ahead of the pelvis.
  const seat = new Vector3(pelvis.x, pelvis.y - 0.115, pelvis.z - 0.16);
  // Backrest a trunk-thickness behind the spine's mid point, tilted with the trunk.
  const mid = pelvis.clone().addScaledVector(trunk, 0.22);
  const behind = new Vector3(0, 0, -1).applyAxisAngle(new Vector3(1, 0, 0), (pitch * Math.PI) / 180);
  const backrest = mid.clone().addScaledVector(behind, 0.135);
  const offset = backrest.clone().sub(seat);
  console.log(
    `${id}\n  seatFixture(${triple(seat)}, { offset: ${triple(offset)}, tilt: ${round(pitch)} }),`,
  );
}

if (!process.env.VITEST) {
  const wanted = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
  if (wanted.length > 0) {
    for (const id of wanted) {
      const motion = motions[id];
      if (!motion) {
        console.log(`unknown motion ${id}`);
        continue;
      }
      fit(createMotionState(rest, motion), id);
    }
  } else {
    for (const id of SEATED) fit(createMotionState(rest, motions[id]!), id);
    console.log('');
    for (const id of CHEST_PAD) fitPad(createMotionState(rest, motions[id]!), id);
  }
}
