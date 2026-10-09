import { describe, expect, it } from 'vitest';
import { Bone, Quaternion, type Object3D } from 'three';
import { createMotionState, applyPose, sampleMotion, applyMotionToBones, type MotionState } from '../src/motion/sampler';
import { buildPose } from '../src/motion/authoring';
import type { MotionDefinition, PlantBone } from '../src/motion/types';
import { loadRig, dumpJson, roundVector } from './helpers/motionRig';

const probe = (plantBones: PlantBone[] = []): MotionDefinition => ({
  id: 'probe',
  name: 'probe',
  summary: '',
  durationSeconds: 1,
  plantBones,
  equipment: [],
  standards: [],
  keys: [{ t: 0, phase: 0, label: '', pose: {} }],
});

function stateFor(motion = probe()): MotionState {
  const { rest } = loadRig();
  return createMotionState(rest, motion);
}

const at = (state: MotionState, bone: string) => state.worldPosition.get(bone)!;
const round = (value: number) => Math.round(value * 1000) / 1000;
const describeVector = (vector: { x: number; y: number; z: number }) =>
  `(${round(vector.x)}, ${round(vector.y)}, ${round(vector.z)})`;

describe('rig rest pose', () => {
  it('matches the shipped CC0 model and can be reported for inspection', () => {
    const { rest } = loadRig();
    expect(rest.order).toContain('pelvis');
    expect(rest.order).toContain('spine_03');
    expect(rest.order.filter((name) => name.startsWith('thigh_'))).toHaveLength(2);
    expect(rest.order).toHaveLength(53);
    dumpJson('rig', {
      order: rest.order,
      parents: Object.fromEntries(rest.order.map((name) => [name, rest.bones.get(name)!.parent])),
      rest: Object.fromEntries(rest.order.map((name) => [name, roundVector(rest.bones.get(name)!.worldPosition)])),
    });
  });

  it('reports rest segment angles used to author the poses', () => {
    const { rest } = loadRig();
    const angle = (a: string, b: string, c: string) => {
      const first = rest.bones.get(b)!.worldPosition.clone().sub(rest.bones.get(a)!.worldPosition).normalize();
      const second = rest.bones.get(c)!.worldPosition.clone().sub(rest.bones.get(b)!.worldPosition).normalize();
      return Math.acos(Math.min(1, Math.max(-1, first.dot(second)))) * (180 / Math.PI);
    };
    const line = {
      knee: angle('thigh_l', 'calf_l', 'foot_l'),
      elbow: angle('upperarm_l', 'lowerarm_l', 'hand_l'),
      ankle: angle('calf_l', 'foot_l', 'ball_l'),
    };
    dumpJson('rest-angles', line);
    expect(line.knee).toBeGreaterThan(0);
    expect(line.elbow).toBeGreaterThan(0);
  });
});

describe('joint rotation conventions', () => {
  it('x tips the body forward and swings hanging bones backward', () => {
    const state = stateFor();
    const spine = stateFor();
    applyPose(spine, { spine_03: { x: 20 } });
    expect(at(spine, 'head').z).toBeGreaterThan(at(state, 'head').z);
    expect(at(spine, 'head').y).toBeLessThan(at(state, 'head').y);

    const arm = stateFor();
    applyPose(arm, { upperarm_l: { x: 20 } });
    expect(at(arm, 'lowerarm_l').z).toBeLessThan(at(state, 'lowerarm_l').z);

    const leg = stateFor();
    applyPose(leg, { thigh_l: { x: 20 } });
    expect(at(leg, 'calf_l').z).toBeLessThan(at(state, 'calf_l').z);
  });

  it('z lifts the left side and swings the left limbs outward', () => {
    const state = stateFor();
    const arm = stateFor();
    applyPose(arm, { upperarm_l: { z: 25 } });
    expect(at(arm, 'hand_l').x).toBeGreaterThan(at(state, 'hand_l').x);
    expect(at(arm, 'hand_l').y).toBeGreaterThan(at(state, 'hand_l').y);
  });

  it('y turns the figure around its vertical axis', () => {
    const state = stateFor();
    const spine = stateFor();
    applyPose(spine, { spine_03: { y: 20 } });
    expect(at(spine, 'upperarm_l').z).toBeLessThan(at(state, 'upperarm_l').z);
    expect(at(spine, 'upperarm_r').z).toBeGreaterThan(at(state, 'upperarm_r').z);
  });

  it('hinge bends each joint the way the movement needs', () => {
    const base = stateFor();

    const hip = stateFor();
    applyPose(hip, { thigh_l: { x: -60 } });
    expect(at(hip, 'calf_l').z).toBeGreaterThan(at(base, 'calf_l').z);

    const knee = stateFor();
    applyPose(knee, { calf_l: { hinge: 60 } });
    const kneeShift = at(knee, 'foot_l').clone().sub(at(knee, 'calf_l'));
    const kneeRest = at(base, 'foot_l').clone().sub(at(base, 'calf_l'));
    expect(kneeShift.z).toBeLessThan(kneeRest.z);
    expect(kneeShift.y).toBeGreaterThan(kneeRest.y);

    const elbow = stateFor();
    applyPose(elbow, { lowerarm_l: { hinge: 60 } });
    const flexed = at(elbow, 'hand_l').distanceTo(at(elbow, 'upperarm_l'));
    const straight = at(base, 'hand_l').distanceTo(at(base, 'upperarm_l'));
    expect(flexed).toBeLessThan(straight);

    const ankle = stateFor();
    applyPose(ankle, { foot_l: { hinge: 20 } });
    expect(at(ankle, 'ball_l').y).toBeLessThan(at(base, 'ball_l').y);

    const dorsiflexion = stateFor();
    applyPose(dorsiflexion, { foot_l: { hinge: -20 } });
    expect(at(dorsiflexion, 'ball_l').y).toBeGreaterThan(at(base, 'ball_l').y);
  });

  it('keeps planted contact bones at their rest spot', () => {
    const state = stateFor(probe(['ball_l', 'ball_r']));
    const restBall = at(state, 'ball_l').clone();
    const restOther = at(state, 'ball_r').clone();
    applyPose(state, buildPose({ legs: { thigh: -55, knee: 95 } }));
    // The sole stays flat through the whole squat, so both feet keep the exact spot they rest on.
    expect(at(state, 'ball_l').distanceTo(restBall)).toBeLessThan(1e-6);
    expect(at(state, 'ball_r').distanceTo(restOther)).toBeLessThan(1e-6);
    expect(at(state, 'pelvis').y).toBeLessThan(1.002);
    expect(at(state, 'pelvis').z).toBeLessThan(0);
  });

  it('never leaves a bone with a broken transform', () => {
    const state = stateFor();
    applyPose(state, { spine_02: { x: 10, y: 5, z: 3 }, lowerarm_r: { hinge: 40, twist: 10 } });
    for (const name of state.rest.order) {
      const position = at(state, name);
      expect(Number.isFinite(position.x + position.y + position.z), name).toBe(true);
      expect(position.length()).toBeLessThan(3);
    }
  });
});

describe('motion sampling', () => {
  it('interpolates between keys and reports the current phase', () => {
    const { rest } = loadRig();
    const motion: MotionDefinition = {
      ...probe(),
      keys: [
        { t: 0, phase: 0, label: 'شروع', pose: { thigh_l: { x: 0 } } },
        { t: 0.5, phase: 1, label: 'پایین', pose: { thigh_l: { x: -30 } } },
      ],
    };
    const state = createMotionState(rest, motion);
    sampleMotion(state, 0);
    expect(state.keyLabel).toBe('شروع');
    const start = at(state, 'calf_l').z;
    sampleMotion(state, 0.25);
    expect(state.keyPhase).toBe(1);
    const quarter = at(state, 'calf_l').z;
    sampleMotion(state, 0.5);
    const half = at(state, 'calf_l').z;
    const keyPose = (x: number) => {
      const other = createMotionState(rest, probe());
      applyPose(other, { thigh_l: { x } });
      return at(other, 'calf_l').z;
    };
    expect(start).toBeCloseTo(keyPose(0), 6);
    expect(half).toBeCloseTo(keyPose(-30), 6);
    // Halfway through the motion the knee has travelled further from the start than at a quarter.
    expect(Math.abs(half - start)).toBeGreaterThan(Math.abs(quarter - start));
  });

  it('writes the sampled pose onto three.js bone objects', () => {
    const { rest } = loadRig();
    const state = createMotionState(rest, probe());
    const objects = new Map<string, Object3D>();
    for (const name of rest.order) {
      const bone = new Bone();
      bone.name = name;
      objects.set(name, bone);
    }
    // The bones parent each other the way the rig does, so the sampler's frame
    // conversion is exercised: a world rotation has to be re-expressed in the
    // frame of whichever parent bone carries it.
    for (const name of rest.order) {
      const parent = rest.bones.get(name)!.parent;
      if (parent) objects.get(parent)!.add(objects.get(name)!);
    }
    applyPose(state, { thigh_l: { x: -20 } });
    applyMotionToBones(state, objects);
    objects.get('Root')!.updateMatrixWorld(true);
    for (const name of rest.order) {
      const world = new Quaternion();
      objects.get(name)!.getWorldQuaternion(world);
      expect(world.angleTo(state.worldQuaternion.get(name)!), `world rotation ${name}`).toBeLessThan(0.001);
    }
    // The knee inherits the hip's rotation, so it is no longer at its rest rotation…
    expect(objects.get('calf_l')!.quaternion.equals(rest.bones.get('calf_l')!.localQuaternion)).toBe(false);
    // …while a bone the pose never touches keeps the local rotation of the file. The
    // rig's matrices decompose back with a residue of ~1e-3 rad, so that is the bar.
    const untouched = new Quaternion().copy(rest.bones.get('hand_r')!.localQuaternion).invert().multiply(objects.get('hand_r')!.quaternion);
    expect(untouched.angleTo(new Quaternion())).toBeLessThan(0.002);
    expect(objects.get('Root')!.position.y).toBeCloseTo(rest.bones.get('Root')!.localPosition.y, 6);
    expect(objects.get('Root')!.position.y).toBeLessThan(0.002);
  });
});

describe('pose dump', () => {
  it('serialises the rest pose for the offline preview renderer', () => {
    const state = stateFor();
    applyPose(state, {});
    dumpJson('pose-rest', {
      bones: Object.fromEntries(state.rest.order.map((name) => [name, roundVector(at(state, name))])),
      equipment: state.equipment.map((placement) => ({
        kind: placement.kind,
        side: placement.side,
        position: roundVector(placement.position),
        anchor: placement.anchor ? roundVector(placement.anchor) : null,
      })),
      fixtures: state.fixtures,
    });
    const { rest } = loadRig();
    expect(describeVector(rest.bones.get('pelvis')!.worldPosition)).toMatch(/^\(/);
    expect(state.rest.order.length).toBe(53);
  });
});
