import { describe, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { applyPose, boneAxes, createMotionState } from '../src/motion/sampler';
import type { MotionDefinition } from '../src/motion/types';
import { loadRig } from './helpers/motionRig';

const { rest } = loadRig();
const motion: MotionDefinition = {
  id: 'probe', name: 'probe', summary: '', durationSeconds: 1, plantBones: [], equipment: [], standards: [],
  keys: [{ t: 0, phase: 0, label: '', pose: {} }],
};
const fmt = (v: Vector3) => `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}`;
const rotate = (point: Vector3, pivot: Vector3, axis: Vector3, degrees: number) =>
  point.clone().sub(pivot).applyQuaternion(new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180)).add(pivot);

const tips: [string, string][] = [
  ['spine_02', 'head'], ['pelvis', 'spine_03'], ['upperarm_l', 'hand_l'], ['upperarm_r', 'hand_r'],
  ['lowerarm_l', 'hand_l'], ['thigh_l', 'calf_l'], ['thigh_r', 'calf_r'], ['calf_l', 'foot_l'],
  ['foot_l', 'ball_l'], ['neck_01', 'head'], ['clavicle_l', 'upperarm_l'],
];

describe('probe', () => {
  it('cross-checks every axis against a hand-rolled world rotation', () => {
    const axes: [string, Vector3][] = [['x', new Vector3(1, 0, 0)], ['y', new Vector3(0, 1, 0)], ['z', new Vector3(0, 0, 1)]];
    let worst = 0;
    for (const [bone, tip] of tips) {
      for (const [key, axis] of axes) {
        const state = createMotionState(rest, motion);
        applyPose(state, { [bone]: { [key]: 25 } });
        const pivot = rest.bones.get(bone)!.worldPosition;
        const expected = rotate(rest.bones.get(tip)!.worldPosition, pivot, axis, 25);
        const delta = state.worldPosition.get(tip)!.distanceTo(expected);
        worst = Math.max(worst, delta);
        if (delta > 1e-6) console.log('MISMATCH', bone, key, delta.toFixed(6), fmt(state.worldPosition.get(tip)!), fmt(expected));
      }
    }
    console.log('worst axis mismatch', worst.toFixed(8));

    for (const bone of ['lowerarm_l', 'lowerarm_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']) {
      const state = createMotionState(rest, motion);
      applyPose(state, { [bone]: { hinge: 30 } });
      const restQ = rest.bones.get(bone)!.worldQuaternion.clone();
      const applied = state.worldQuaternion.get(bone)!.clone().multiply(restQ.invert());
      const axis = new Vector3(applied.x, applied.y, applied.z).normalize();
      const info = boneAxes(rest, bone);
      const expected = info.hinge!;
      const aligned = axis.dot(expected) > 0.9999 ? 'same' : axis.dot(expected) < -0.9999 ? 'FLIPPED' : `off(${axis.dot(expected).toFixed(4)}) ${fmt(axis)} vs ${fmt(expected)}`;
      const tip = { lowerarm_l: 'hand_l', lowerarm_r: 'hand_r', calf_l: 'foot_l', calf_r: 'foot_r', foot_l: 'ball_l', foot_r: 'ball_r' }[bone]!;
      const move = state.worldPosition.get(tip)!.clone().sub(rest.bones.get(tip)!.worldPosition);
      console.log('hinge', bone.padEnd(11), 'axis vs derived:', aligned.padEnd(28), 'angle', (2 * Math.acos(Math.min(1, Math.abs(applied.w))) * 180 / Math.PI).toFixed(2), 'tip delta', fmt(move));
    }
  });
});
