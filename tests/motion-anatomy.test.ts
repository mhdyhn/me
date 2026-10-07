import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState } from '../src/motion/sampler';
import { jointRanges, type JointRange } from '../tools/motion-angles';
import { motions } from '../src/motion/library';

const { scene } = buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb'))));
const rest = collectRestSkeleton(scene);

/**
 * The written form checkpoints only mean something if the loop actually moves
 * the joint that way. These bounds are deliberately wide: they catch a reversed
 * or hyper-extended joint, not a matter of taste.
 */
describe('movement anatomy', () => {
  for (const motion of Object.values(motions)) {
    it(`${motion.id} moves every joint in a human direction`, () => {
      const ranges = jointRanges(createMotionState(rest, motion));
      const report = (joint: string, range: JointRange) => `${motion.id} ${joint} ${range[0].toFixed(1)}–${range[1].toFixed(1)}`;

      // Knees and elbows bend a lot and never open past straight.
      expect(ranges.knee[1], report('knee', ranges.knee)).toBeLessThan(183);
      expect(ranges.knee[0], report('knee', ranges.knee)).toBeGreaterThan(25);
      expect(ranges.elbow[1], report('elbow', ranges.elbow)).toBeLessThan(183);
      expect(ranges.elbow[0], report('elbow', ranges.elbow)).toBeGreaterThan(15);
      // A hip never folds flatter than a deep squat.
      expect(ranges.hip[0], report('hip', ranges.hip)).toBeGreaterThan(60);
      // The trunk stays inside a hunched-to-tall range, with no neck thrown back.
      expect(ranges.trunk[0], report('trunk', ranges.trunk)).toBeGreaterThan(100);
      expect(ranges.trunk[1], report('trunk', ranges.trunk)).toBeLessThan(185);
    });
  }
});
