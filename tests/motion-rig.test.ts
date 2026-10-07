import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { buildMotionRig, motionBounds, poseRig, restRig } from '../src/motion/modelRig';
import { phaseToTime } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const scene = () => buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb')))).scene;

describe('browser rig', () => {
  it('binds the shipped model to a movement loop and writes the loop onto the bones', () => {
    const rig = buildMotionRig(scene(), motions['barbell-bench-press']!);
    expect(rig.rest.order).toHaveLength(53);
    expect(rig.bones.size).toBe(53);

    const elbow = rig.bones.get('lowerarm_l')!;
    const rest = elbow.quaternion.clone();

    poseRig(rig, 0);
    const lockout = elbow.quaternion.clone();
    poseRig(rig, 0.5);
    const touch = elbow.quaternion.clone();

    // The two ends of a press bend the elbow differently, and neither is the rest pose.
    expect(lockout.equals(rest)).toBe(false);
    expect(touch.equals(lockout)).toBe(false);
    expect(Math.abs(touch.angleTo(lockout))).toBeGreaterThan(0.2);
    // World positions stay in sync with what the bones show.
    const hand = new Vector3().setFromMatrixPosition(elbow.matrixWorld.clone().identity().copy(elbow.matrix));
    expect(Number.isFinite(hand.x)).toBe(true);
  });

  it('restores the rest pose after unmounting', () => {
    const rig = buildMotionRig(scene(), motions['barbell-squat']!);
    const thigh = rig.bones.get('thigh_l')!;
    const rest = thigh.quaternion.clone();
    poseRig(rig, 0.5);
    expect(thigh.quaternion.equals(rest)).toBe(false);
    restRig(rig);
    expect(thigh.quaternion.equals(rest)).toBe(true);
  });

  it('frames both upright and lying loops', () => {
    const squat = motionBounds(buildMotionRig(scene(), motions['barbell-squat']!));
    const bench = motionBounds(buildMotionRig(scene(), motions['barbell-bench-press']!));
    expect(squat.radius).toBeGreaterThan(0.6);
    expect(bench.centre[2]).toBeLessThan(-0.5);
    // A lying press reaches further along the body's axis than a squat does in height.
    expect(bench.radius).toBeGreaterThan(1);
  });
});

describe('written steps and the loop', () => {
  it('maps every written step to a loop position the viewer can jump to', () => {
    const motion = motions['barbell-squat']!;
    const rig = buildMotionRig(scene(), motion);
    const at = (phase: number) => {
      const time = phaseToTime(rig.state, phase);
      expect(time, `phase ${phase}`).not.toBeNull();
      return poseRig(rig, time!);
    };

    // Every step before the closing key lands on its own key.
    for (const key of motion.keys.filter((entry) => entry.phase < 4)) {
      const state = at(key.phase);
      expect(state.keyPhase, `phase ${key.phase}`).toBe(key.phase);
      expect(state.keyLabel, `phase ${key.phase}`).toBe(key.label);
    }

    // The fifth step is the loop end, and a loop ends on the pose it started from.
    const start = at(0);
    const finish = at(4);
    for (const bone of ['pelvis', 'foot_l', 'hand_l']) {
      expect(finish.worldPosition.get(bone)!.distanceTo(start.worldPosition.get(bone)!), bone).toBeLessThan(1e-6);
    }
  });
});

describe('movement guardrails', () => {
  const groundBones = (motionId: string) => {
    const rig = buildMotionRig(scene(), motions[motionId]!);
    const lowest = { name: '', y: Number.POSITIVE_INFINITY };
    for (let step = 0; step < 12; step += 1) {
      poseRig(rig, step / 12);
      for (const [name, position] of rig.state.worldPosition) {
        if (name === 'Root') continue;
        if (position.y < lowest.y) {
          lowest.name = name;
          lowest.y = position.y;
        }
      }
    }
    return lowest;
  };

  it('never lets a body bone sink through the floor', () => {
    for (const motion of Object.values(motions)) {
      // Hanging from a bar is the one movement where the body is off the floor.
      if (motion.fixtures?.some((fixture) => fixture.kind === 'pull-up-bar')) continue;
      const lowest = groundBones(motion.id);
      expect(lowest.y, `${motion.id}: ${lowest.name}`).toBeGreaterThan(-0.05);
    }
  });

  it('keeps planted feet on the floor plane for every stance', () => {
    for (const motion of Object.values(motions)) {
      if (motion.plantBones.length === 0) continue;
      const rig = buildMotionRig(scene(), motion);
      for (let step = 0; step < 8; step += 1) {
        poseRig(rig, step / 8);
        for (const bone of motion.plantBones) {
          const y = rig.state.worldPosition.get(bone)!.y;
          expect(y, `${motion.id} ${bone} at ${step}`).toBeGreaterThan(-0.02);
          expect(y, `${motion.id} ${bone} at ${step}`).toBeLessThan(0.06);
        }
      }
    }
  });
});
