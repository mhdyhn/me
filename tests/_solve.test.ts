import { describe, it } from 'vitest';
import { Vector3 } from 'three';
import { applyPose, createMotionState, type MotionState } from '../src/motion/sampler';
import type { JointRotation, MotionDefinition, Pose } from '../src/motion/types';
import { loadRig } from './helpers/motionRig';

const { rest } = loadRig();
const motion: MotionDefinition = {
  id: 'solve', name: 'solve', summary: '', durationSeconds: 1, plantBones: [], equipment: [], standards: [],
  keys: [{ t: 0, phase: 0, label: '', pose: {} }],
};

const at = (state: MotionState, bone: string) => state.worldPosition.get(bone)!;

/** Anatomically sane search bounds, so the solver cannot fold a joint backwards. */
export const BOUNDS: Record<string, [number, number]> = {
  'upperarm.x': [-115, 115],
  'upperarm.y': [-95, 95],
  'upperarm.z': [-85, 140],
  'lowerarm.hinge': [0, 145],
  'thigh.x': [-125, 45],
  'thigh.y': [-45, 45],
  'calf.hinge': [0, 145],
  'foot.hinge': [-45, 45],
  'spine.x': [-25, 60],
  'hand.x': [-70, 70],
  'hand.z': [-60, 60],
};

interface SolveTarget {
  bone: string;
  target: [number, number, number];
  weight?: number;
}

function clamp(value: number, bone: string, key: string): number {
  const bounds = BOUNDS[`${bone.replace(/_[lr]$/, '')}.${key}`];
  if (!bounds) return value;
  return Math.min(bounds[1], Math.max(bounds[0], value));
}

/** Grid search plus refinement that places bones on world-space targets. */
function solve(
  bones: [string, string][],
  targets: SolveTarget[],
  base: Pose = {},
  root: [number, number, number] = [0, 0, 0],
): string {
  const state = createMotionState(rest, motion);
  const evaluate = (values: number[]) => {
    const pose: Pose = { ...base };
    bones.forEach(([bone, key], index) => {
      pose[bone] = { ...(pose[bone] ?? {}), [key]: values[index] } as JointRotation;
    });
    applyPose(state, pose, root);
    let cost = 0;
    for (const { bone, target, weight = 1 } of targets) {
      cost += weight * at(state, bone).distanceTo(new Vector3().fromArray(target));
    }
    return cost;
  };

  const range = (index: number) => BOUNDS[`${bones[index]![0].replace(/_[lr]$/, '')}.${bones[index]![1]}`] ?? [-90, 90];
  const spread = (limits: [number, number], count: number) => {
    const [min, max] = limits;
    return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
  };

  let candidates: number[][] = [[]];
  bones.forEach((_, index) => {
    const values = spread(range(index), 7);
    candidates = candidates.flatMap((prefix) => values.map((value) => [...prefix, value]));
  });
  let scored = candidates.map((values) => ({ values, cost: evaluate(values) })).sort((a, b) => a.cost - b.cost);

  for (let round = 0; round < 3; round += 1) {
    const next: number[][] = [];
    bones.forEach((_, index) => {
      const [min, max] = range(index);
      const span = (max - min) / 8 / (round + 1);
      const centre = scored[0]!.values[index]!;
      next.push(Array.from({ length: 7 }, (_, i) => clamp(centre + span * (i - 3), bones[index]![0], bones[index]![1])));
    });
    const grid: number[][] = [[]];
    for (const values of next) {
      const grown: number[][] = [];
      for (const prefix of grid) for (const value of values) grown.push([...prefix, value]);
      grid.length = 0;
      grid.push(...grown);
    }
    const ranked = grid.map((values) => ({ values, cost: evaluate(values) })).sort((a, b) => a.cost - b.cost);
    scored = ranked.slice(0, 3).concat(scored.slice(0, 2)).sort((a, b) => a.cost - b.cost);


  }

  const best = scored[0]!;
  const values = bones.map(([bone, key], index) => `${bone}.${key}=${Math.round(best.values[index]! * 10) / 10}`);
  return `${values.join(' ')}  err=${best.cost.toFixed(3)}`;
}

const ARM: [string, string][] = [
  ['upperarm_l', 'x'],
  ['upperarm_l', 'y'],
  ['upperarm_l', 'z'],
  ['lowerarm_l', 'hinge'],
];

const SUPINE: [Pose, [number, number, number]] = [{ Root: { x: -90 } }, [0, 0.55, 0]];
const STAND: [Pose, [number, number, number]] = [{}, [0, 0, 0]];

describe('authoring solver', () => {
  it('prints solved arm poses', () => {
    const cases: [string, SolveTarget[], [Pose, [number, number, number]]][] = [
      ['squat grip', [
        { bone: 'hand_l', target: [0.3, 1.42, -0.12] },
        { bone: 'lowerarm_l', target: [0.275, 1.228, -0.052], weight: 0.8 },
      ], STAND],
      ['bench lockout', [
        { bone: 'hand_l', target: [0.2, 1.1, -1.37] },
        { bone: 'lowerarm_l', target: [0.266, 0.823, -1.43], weight: 0.8 },
      ], SUPINE],
      ['bench touch', [
        { bone: 'hand_l', target: [0.2, 0.76, -1.18] },
        { bone: 'lowerarm_l', target: [0.44, 0.62, -1.34], weight: 0.8 },
      ], SUPINE],
      ['curl up', [
        { bone: 'hand_l', target: [0.26, 1.44, 0.16] },
        { bone: 'lowerarm_l', target: [0.221, 1.21, 0.03], weight: 0.8 },
      ], STAND],
      ['curl down', [
        { bone: 'hand_l', target: [0.24, 0.98, 0.14] },
        { bone: 'lowerarm_l', target: [0.221, 1.21, 0.03], weight: 0.8 },
      ], STAND],
      ['press bottom', [
        { bone: 'hand_l', target: [0.3, 1.4, -0.02] },
        { bone: 'lowerarm_l', target: [0.42, 1.23, 0.02], weight: 0.8 },
      ], STAND],
      ['press top', [
        { bone: 'hand_l', target: [0.17, 1.79, 0.03] },
        { bone: 'lowerarm_l', target: [0.28, 1.52, 0.06], weight: 0.8 },
      ], STAND],
      ['lateral down', [
        { bone: 'hand_l', target: [0.24, 1.05, 0.02] },
        { bone: 'lowerarm_l', target: [0.221, 1.21, 0.03], weight: 0.8 },
      ], STAND],
      ['lateral up', [
        { bone: 'hand_l', target: [0.72, 1.5, 0.04] },
        { bone: 'lowerarm_l', target: [0.44, 1.42, 0.03], weight: 0.8 },
      ], STAND],
      ['pullup hang', [
        { bone: 'hand_l', target: [0.2, 2.01, 0.02] },
        { bone: 'lowerarm_l', target: [0.24, 1.74, 0.02], weight: 0.8 },
      ], STAND],
      ['pulldown top', [
        { bone: 'hand_l', target: [0.34, 1.92, 0.05] },
        { bone: 'lowerarm_l', target: [0.37, 1.66, 0.04], weight: 0.8 },
      ], STAND],
      ['pulldown bottom', [
        { bone: 'hand_l', target: [0.26, 1.44, 0.16] },
        { bone: 'lowerarm_l', target: [0.36, 1.56, -0.06], weight: 0.8 },
      ], STAND],
      ['row extended', [
        { bone: 'hand_l', target: [0.22, 1.24, 0.56] },
        { bone: 'lowerarm_l', target: [0.3, 1.15, 0.3], weight: 0.8 },
      ], STAND],
      ['row pulled', [
        { bone: 'hand_l', target: [0.28, 1.22, 0.14] },
        { bone: 'lowerarm_l', target: [0.34, 1.2, -0.14], weight: 0.8 },
      ], STAND],
      ['face pull', [
        { bone: 'hand_l', target: [0.26, 1.62, 0.3] },
        { bone: 'lowerarm_l', target: [0.46, 1.56, 0.08], weight: 0.8 },
      ], STAND],
      ['pushdown top', [
        { bone: 'hand_l', target: [0.27, 1.44, 0.3] },
        { bone: 'lowerarm_l', target: [0.25, 1.24, 0.02], weight: 0.8 },
      ], STAND],
      ['pushdown bottom', [
        { bone: 'hand_l', target: [0.27, 1.08, 0.22] },
        { bone: 'lowerarm_l', target: [0.25, 1.24, 0.02], weight: 0.8 },
      ], STAND],
      ['overhead ext down', [
        { bone: 'hand_l', target: [0.2, 1.5, -0.18] },
        { bone: 'lowerarm_l', target: [0.26, 1.72, 0.04], weight: 0.8 },
      ], STAND],
      ['overhead ext up', [
        { bone: 'hand_l', target: [0.2, 1.9, -0.1] },
        { bone: 'lowerarm_l', target: [0.26, 1.72, 0.04], weight: 0.8 },
      ], STAND],
      ['fly open', [
        { bone: 'hand_l', target: [0.62, 1.44, 0.32] },
        { bone: 'lowerarm_l', target: [0.44, 1.4, 0.26], weight: 0.8 },
      ], STAND],
      ['fly closed', [
        { bone: 'hand_l', target: [0.14, 1.46, 0.44] },
        { bone: 'lowerarm_l', target: [0.34, 1.4, 0.34], weight: 0.8 },
      ], STAND],
    ];
    for (const [label, targets, [base, root]] of cases) {
      console.log(label.padEnd(18), solve(ARM, targets, base, root));
    }
  });
});
