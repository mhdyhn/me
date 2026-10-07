/**
 * Joint-angle audit for every authored loop (dev tool, not shipped).
 *
 *   npx vite-node tools/motion-angles.ts            # every motion
 *   npx vite-node tools/motion-angles.ts barbell-squat
 *
 * 180° is a straight joint. The columns show the range each joint travels
 * through one loop, so a squat should bend the knee a long way and a calf raise
 * should keep it nearly straight. `tests/motion-anatomy.test.ts` asserts the
 * same numbers stay inside a human range.
 */
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState, sampleMotion, type MotionState } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const { scene } = buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb'))));
const rest = collectRestSkeleton(scene);

export const jointAngle = (state: MotionState, a: string, b: string, c: string): number => {
  const pa = state.worldPosition.get(a)!;
  const pb = state.worldPosition.get(b)!;
  const pc = state.worldPosition.get(c)!;
  const first = new Vector3().subVectors(pa, pb).normalize();
  const second = new Vector3().subVectors(pc, pb).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, first.dot(second)))) * 180) / Math.PI;
};

export type JointRange = [min: number, max: number];

/** Ranges of the joints the form checkpoints care about. */
export const jointRanges = (state: MotionState, samples = 16) => {
  const ranges: Record<'knee' | 'elbow' | 'hip' | 'trunk', JointRange> = {
    knee: [Number.POSITIVE_INFINITY, 0],
    elbow: [Number.POSITIVE_INFINITY, 0],
    hip: [Number.POSITIVE_INFINITY, 0],
    trunk: [Number.POSITIVE_INFINITY, 0],
  };
  const track = (range: JointRange, value: number) => {
    range[0] = Math.min(range[0], value);
    range[1] = Math.max(range[1], value);
  };
  for (let step = 0; step < samples; step += 1) {
    sampleMotion(state, step / samples);
    track(ranges.knee, jointAngle(state, 'thigh_l', 'calf_l', 'foot_l'));
    track(ranges.elbow, jointAngle(state, 'upperarm_l', 'lowerarm_l', 'hand_l'));
    track(ranges.hip, jointAngle(state, 'spine_03', 'thigh_l', 'calf_l'));
    track(ranges.trunk, jointAngle(state, 'pelvis', 'spine_03', 'head'));
  }
  return ranges;
};

const span = (range: JointRange) => `${range[0].toFixed(0)}–${range[1].toFixed(0)}`;

// The anatomy test imports `jointRanges`; only the CLI run prints the table.
if (!process.env.VITEST) {
  const wanted = process.argv.slice(2).filter((argument) => !argument.startsWith('-'));
  const ids = wanted.length > 0 ? wanted : Object.keys(motions);
  console.log('id'.padEnd(32), 'knee'.padStart(9), 'elbow'.padStart(9), 'hip'.padStart(9), 'trunk'.padStart(9));
  for (const id of ids) {
    const motion = motions[id];
    if (!motion) {
      console.log(`unknown motion ${id}`);
      continue;
    }
    const state = createMotionState(rest, motion);
    const ranges = jointRanges(state);
    console.log(
      id.padEnd(32),
      span(ranges.knee).padStart(9),
      span(ranges.elbow).padStart(9),
      span(ranges.hip).padStart(9),
      span(ranges.trunk).padStart(9),
    );
  }
}
