import { describe, expect, it } from 'vitest';
import { loadRig } from './helpers/motionRig';
import { createMotionState, sampleMotion } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

/**
 * Regression checks for the contact fixes made on the bench presses and the face
 * pull. The general loop test only checks declared plant bones, and these movements
 * declare none, so their feet and hands need their own floor and reach checks.
 */
const SAMPLES = 16;

const lowestFoot = (state: ReturnType<typeof createMotionState>) =>
  Math.min(...['foot_l', 'foot_r', 'ball_l', 'ball_r'].map((name) => state.worldPosition.get(name)!.y));

describe('bench presses keep their feet on the floor', () => {
  for (const id of ['barbell-bench-press', 'incline-barbell-press', 'incline-dumbbell-press', 'machine-chest-press'] as const) {
    it(`${id}: feet never sink below the floor and stay within 4 cm of it`, () => {
      const { rest } = loadRig();
      const state = createMotionState(rest, motions[id]!);
      for (let step = 0; step < SAMPLES; step += 1) {
        sampleMotion(state, step / SAMPLES);
        const foot = lowestFoot(state);
        expect(foot, `${id} at ${step}`).toBeGreaterThan(-0.01);
        expect(foot, `${id} at ${step}`).toBeLessThan(0.04);
      }
    });
  }
});

describe('face pull reaches the face', () => {
  // Measured 0.44 m before the arm-pose change and 0.24 m after it. The face is not
  // reached yet; this bound pins the improvement so it cannot quietly regress.
  it('keeps a hand within 25 cm of the head centre during the loop', () => {
    const { rest } = loadRig();
    const state = createMotionState(rest, motions['face-pull']!);
    let closest = Infinity;
    for (let step = 0; step < SAMPLES; step += 1) {
      sampleMotion(state, step / SAMPLES);
      const head = state.worldPosition.get('head')!;
      closest = Math.min(
        closest,
        state.worldPosition.get('hand_l')!.distanceTo(head),
        state.worldPosition.get('hand_r')!.distanceTo(head),
      );
    }
    expect(closest).toBeLessThan(0.25);
  });
});
