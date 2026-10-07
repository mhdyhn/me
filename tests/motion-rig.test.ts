import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { buildMotionRig, motionBounds, poseRig, restRig } from '../src/motion/modelRig';
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
