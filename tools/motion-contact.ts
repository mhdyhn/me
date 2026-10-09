/**
 * Offline contact check for the authored movement loops (dev tool, not shipped).
 *
 *   npx vite-node tools/motion-contact.ts                # every motion, 16 phases
 *   npx vite-node tools/motion-contact.ts barbell-squat  # one motion
 *
 * For each loop it prints three numbers that the picture alone cannot settle:
 *   - feet: lowest foot/ball height over the loop (metres). Near 0 means the feet
 *     reach the floor at some point; a value that never drops below ~3 cm means
 *     the feet float the whole time (only fine when they rest on a platform).
 *   - grip(L/R): the worst distance, over the loop, from each hand to the nearest implement.
 *     A bar counts as a segment of its half-length, a dumbbell as its handle,
 *     a cable as the handle point. The rig's wrist sits about 0.10 m from the
 *     grip, so only a distance above 0.13 m counts as a hand that is off the implement.
 *   - head: the closest the head gets to any bar, over the loop (metres).
 *
 * These are geometry checks on the sampled rig, not a judgement of form.
 */
import { readFileSync } from 'node:fs';
import { Quaternion, Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState, sampleMotion, type MotionState } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const MODEL = 'public/models/human.glb';
const PHASES = 16;
const HALF_LENGTH = { barbell: 0.42, dumbbell: 0.085, cable: 0 } as const;

/** Distance from a point to the implement's segment (or handle point). */
function distanceToImplement(point: Vector3, centre: Vector3, quaternion: Quaternion, kind: 'barbell' | 'dumbbell' | 'cable'): number {
  const half = HALF_LENGTH[kind];
  if (half === 0) return point.distanceTo(centre);
  const axis = new Vector3(1, 0, 0).applyQuaternion(quaternion).normalize();
  const a = centre.clone().addScaledVector(axis, -half);
  const b = centre.clone().addScaledVector(axis, half);
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, point.clone().sub(a).dot(ab) / ab.lengthSq()));
  return point.distanceTo(a.clone().addScaledVector(ab, t));
}

function check(id: string) {
  const motion = motions[id as keyof typeof motions];
  if (!motion) throw new Error(`No motion ${id}`);
  const bytes = new Uint8Array(readFileSync(MODEL));
  const { scene } = buildSkeletonScene(readGlbJson(bytes));
  const state: MotionState = createMotionState(collectRestSkeleton(scene), motion);

  let feetMin = Infinity;
  // Worst and best hand-to-implement distance per hand over the loop.
  const handWorst = [0, 0];
  const handBest = [Infinity, Infinity];
  let headClosest = Infinity;
  for (let i = 0; i < PHASES; i += 1) {
    const phase = i / PHASES;
    sampleMotion(state, phase);
    const feet = ['foot_l', 'foot_r', 'ball_l', 'ball_r']
      .map((name) => state.worldPosition.get(name)?.y)
      .filter((y): y is number => y !== undefined);
    feetMin = Math.min(feetMin, ...feet);
      for (const [index, hand] of ['hand_l', 'hand_r'].entries()) {
      const point = state.worldPosition.get(hand);
      if (!point || state.equipment.length === 0) continue;
      let nearest = Infinity;
      for (const entry of state.equipment) {
        nearest = Math.min(nearest, distanceToImplement(point, entry.position, entry.quaternion, entry.kind));
      }
      handWorst[index] = Math.max(handWorst[index]!, nearest);
      handBest[index] = Math.min(handBest[index]!, nearest);
    }
    const head = state.worldPosition.get('head');
    for (const entry of state.equipment) {
      if (!head || entry.kind === 'cable') continue;
      headClosest = Math.min(headClosest, distanceToImplement(head, entry.position, entry.quaternion, entry.kind));
    }
  }
  const fmt = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : '  --- ');
  // A hand that never comes within 0.13 m of an implement is free. A single-hand
  // movement (one cable, one dumbbell row) leaves the other hand free by design, so
  // only flag an off-implement hand when the other hand does hold something, or when
  // both hands are meant to hold (two implements).
  const holding = handBest.map((best) => best <= 0.13);
  const twoHanded = state.equipment.length >= 2 || state.equipment.some((entry) => entry.side === 'both');
  const gripOff = state.equipment.length > 0 && holding.some((ok, i) => ok && handWorst[i]! > 0.13)
    ? true
    : twoHanded && handWorst.some((worst) => worst > 0.13);
  const grip = state.equipment.length === 0 ? '  none ' : `${fmt(handWorst[0]!)}/${fmt(handWorst[1]!)}`;
  const flags: string[] = [];
  if (feetMin > 0.03 && feetMin < 0.3) flags.push('feet-float');
  if (feetMin >= 0.3) flags.push('feet-high(hanging?)');
  if (gripOff) flags.push('grip-off');
  if (Number.isFinite(headClosest) && headClosest < 0.12) flags.push('head-near-bar');
  console.log(
    `${id.padEnd(34)} feet=${fmt(feetMin)} grip(L/R)=${grip} head=${Number.isFinite(headClosest) ? fmt(headClosest) : '  --- '} ${flags.join(' ')}`,
  );
}

const only = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const ids = only ? [only] : Object.keys(motions);
for (const id of ids) check(id);
