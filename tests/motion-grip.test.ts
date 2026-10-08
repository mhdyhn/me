import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { buildMotionRig, poseRig } from '../src/motion/modelRig';
import { motions } from '../src/motion/library';

/**
 * Guards for the grip, which is the part of a figure a viewer reads first: an open
 * hand resting on a bar is what makes a rendered demonstration look fake. Every
 * hand that holds a handle must close around it, with the palm line square to the
 * handle, and no finger may pass through the metal.
 */
const scene = () => buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb')))).scene;
const PHASES = [0, 0.2, 0.4, 0.6, 0.8];
const holding = Object.values(motions).filter((motion) => motion.equipment.length > 0);
const withBarbell = Object.values(motions).filter((motion) => motion.equipment.some((item) => item.kind === 'barbell'));
const withDumbbell = Object.values(motions).filter((motion) => motion.equipment.some((item) => item.kind === 'dumbbell'));

const distanceToAxis = (point: Vector3, origin: Vector3, axis: Vector3) => {
  const rel = new Vector3().subVectors(point, origin);
  return rel.addScaledVector(axis, -rel.dot(axis)).length();
};

/** Every (movement, phase) pair whose hands hold a handle. */
function* grips() {
  for (const motion of holding) {
    const rig = buildMotionRig(scene(), motion);
    for (const phase of PHASES) {
      const state = poseRig(rig, phase);
      for (const placement of state.equipment) {
        yield { motion, phase, state, placement };
      }
    }
  }
}

describe('the grip', () => {
  it('wraps the fingers of every hand that holds a handle', () => {
    let checked = 0;
    for (const { motion, phase, state, placement } of grips()) {
      const axis = new Vector3(1, 0, 0).applyQuaternion(placement.quaternion).normalize();
      const sides: ('l' | 'r')[] = placement.side === 'both' ? ['l', 'r'] : [placement.side as 'l' | 'r'];
      for (const side of sides) {
        for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
          const tip = state.worldPosition.get(`${finger}_03_${side}`)!;
          const distance = distanceToAxis(tip, placement.position, axis);
          // The tip rests on the far side of the handle: on it, not floating away
          // from it, and never buried inside the metal.
          expect(distance, `${motion.id} phase ${phase} ${finger}_${side}`).toBeGreaterThan(0.012);
          expect(distance, `${motion.id} phase ${phase} ${finger}_${side}`).toBeLessThan(0.06);
        }
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('keeps the palm line square to the bar, and the bar square to the shoulders', () => {
    for (const motion of withBarbell) {
      const rig = buildMotionRig(scene(), motion);
      for (const phase of PHASES) {
        const state = poseRig(rig, phase);
        const bar = state.equipment.find((placement) => placement.kind === 'barbell');
        if (!bar) continue;
        const axis = new Vector3(1, 0, 0).applyQuaternion(bar.quaternion).normalize();
        const shoulders = new Vector3()
          .subVectors(state.worldPosition.get('upperarm_l')!, state.worldPosition.get('upperarm_r')!)
          .normalize();
        expect(Math.abs(axis.dot(shoulders)), `${motion.id} phase ${phase} bar vs shoulders`).toBeGreaterThan(0.95);

        for (const side of ['l', 'r'] as const) {
          const line = new Vector3()
            .subVectors(state.worldPosition.get(`index_01_${side}`)!, state.worldPosition.get(`pinky_01_${side}`)!)
            .normalize();
          // A palm line runs along the bar once the wrist is rolled into the grip.
          expect(Math.abs(line.dot(axis)), `${motion.id} phase ${phase} ${side} palm line`).toBeGreaterThan(0.9);
        }
      }
    }
  });

  it('holds a dumbbell along the palm line rather than across the fingers', () => {
    for (const motion of withDumbbell) {
      const rig = buildMotionRig(scene(), motion);
      for (const phase of [0, 0.5]) {
        const state = poseRig(rig, phase);
        for (const placement of state.equipment.filter((item) => item.kind === 'dumbbell')) {
          const axis = new Vector3(1, 0, 0).applyQuaternion(placement.quaternion).normalize();
          const side = placement.side as 'l' | 'r';
          const line = new Vector3()
            .subVectors(state.worldPosition.get(`index_01_${side}`)!, state.worldPosition.get(`pinky_01_${side}`)!)
            .normalize();
          expect(Math.abs(line.dot(axis)), `${motion.id} phase ${phase} ${side} dumbbell`).toBeGreaterThan(0.9);
        }
      }
    }
  });

  it('never lets a phalanx pass through a barbell', () => {
    for (const motion of withBarbell) {
      const rig = buildMotionRig(scene(), motion);
      for (const phase of PHASES) {
        const state = poseRig(rig, phase);
        const bar = state.equipment.find((placement) => placement.kind === 'barbell');
        if (!bar) continue;
        const axis = new Vector3(1, 0, 0).applyQuaternion(bar.quaternion).normalize();
        for (const side of ['l', 'r'] as const) {
          for (const finger of ['index', 'middle', 'ring', 'pinky'] as const) {
            for (const [from, to] of [
              [`${finger}_01_${side}`, `${finger}_02_${side}`],
              [`${finger}_02_${side}`, `${finger}_03_${side}`],
            ] as const) {
              for (let step = 0; step <= 4; step += 1) {
                const point = new Vector3().lerpVectors(
                  state.worldPosition.get(from)!,
                  state.worldPosition.get(to)!,
                  step / 4,
                );
                // The knuckle sits right at the shaft, so the bound here is the shaft's
                // own 14 mm radius: a bone centre inside that has gone through the metal.
                expect(
                  distanceToAxis(point, bar.position, axis),
                  `${motion.id} phase ${phase} ${finger}_${side} step ${step}`,
                ).toBeGreaterThan(0.013);
              }
            }
          }
        }
      }
    }
  });
});
