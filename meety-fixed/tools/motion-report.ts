/**
 * Offline report for the authored movement loops (dev tool, not shipped).
 *
 *   npx vite-node tools/motion-report.ts                 # every motion, 8 samples
 *   npx vite-node tools/motion-report.ts barbell-squat   # one motion
 *
 * Prints where the key joints end up so a pose can be judged from numbers
 * instead of a picture. Angles are degrees between limb segments.
 */
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import { createMotionState, sampleMotion, type MotionState } from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const MODEL = 'public/models/human.glb';

const jointAngle = (state: MotionState, a: string, b: string, c: string): number => {
  const pa = state.worldPosition.get(a);
  const pb = state.worldPosition.get(b);
  const pc = state.worldPosition.get(c);
  if (!pa || !pb || !pc) return Number.NaN;
  const u = new Vector3().subVectors(pa, pb).normalize();
  const v = new Vector3().subVectors(pc, pb).normalize();
  return (Math.acos(Math.max(-1, Math.min(1, u.dot(v)))) * 180) / Math.PI;
};

const fmt = (value: number): string => (Number.isFinite(value) ? value.toFixed(3) : '  --- ');

function report(id: string, steps: number, only?: number) {
  const motion = motions[id];
  if (!motion) throw new Error(`No motion ${id}`);
  const bytes = new Uint8Array(readFileSync(MODEL));
  const { scene } = buildSkeletonScene(readGlbJson(bytes));
  const rest = collectRestSkeleton(scene);
  const state = createMotionState(rest, motion);

  console.log(`\n=== ${id} · ${motion.name} · ${motion.durationSeconds}s · ${motion.keys.length} keys`);
  console.log(
    '  t     label                 pelvis   head    handY(l/r)     elbow(l/r)  knee(l/r)   hip(l/r)  footMin  barErr',
  );
  const count = only ?? steps;
  for (let i = 0; i < count; i += 1) {
    const phase = i / count;
    sampleMotion(state, phase);
    const pelvis = state.worldPosition.get('pelvis')!.y;
    const head = state.worldPosition.get('head')!.y;
    const handL = state.worldPosition.get('hand_l')!;
    const handR = state.worldPosition.get('hand_r')!;
    const footMin = Math.min(
      ...['foot_l', 'foot_r', 'ball_l', 'ball_r'].map((name) => state.worldPosition.get(name)!.y),
    );
    const bar = state.equipment.find((entry) => entry.kind === 'barbell' || entry.kind === 'dumbbell');
    let barErr = 0;
    if (bar) {
      // Distance from each hand to the implement it is holding.
      barErr = Math.max(
        new Vector3().subVectors(handL, bar.position).length(),
        new Vector3().subVectors(handR, bar.position).length(),
      );
    } else if (motion.equipment.length === 0) {
      barErr = Number.NEGATIVE_INFINITY;
    }
    console.log(
      `  ${phase.toFixed(3)} ${motion.keys[0]!.label.slice(0, 4)}  ` +
        `pelvis=${fmt(pelvis)} head=${fmt(head)} ` +
        `handY=${fmt(handL.y)}/${fmt(handR.y)} ` +
        `elbow=${fmt(jointAngle(state, 'upperarm_l', 'lowerarm_l', 'hand_l')).slice(0, 6)}/` +
        `${fmt(jointAngle(state, 'upperarm_r', 'lowerarm_r', 'hand_r')).slice(0, 6)} ` +
        `knee=${fmt(jointAngle(state, 'thigh_l', 'calf_l', 'foot_l')).slice(0, 6)}/` +
        `${fmt(jointAngle(state, 'thigh_r', 'calf_r', 'foot_r')).slice(0, 6)} ` +
        `hip=${fmt(jointAngle(state, 'pelvis', 'thigh_l', 'calf_l')).slice(0, 6)}/` +
        `${fmt(jointAngle(state, 'pelvis', 'thigh_r', 'calf_r')).slice(0, 6)} ` +
        `footMin=${fmt(footMin)} barErr=${Number.isFinite(barErr) ? fmt(barErr) : '  --  '}`,
    );
  }
}

const args = process.argv.slice(2);
const ids = args.filter((arg) => !arg.startsWith('--'));
const stepArg = args.find((arg) => arg.startsWith('--steps='));
const steps = stepArg ? Number(stepArg.slice(8)) : 8;
for (const id of ids.length > 0 ? ids : Object.keys(motions)) {
  report(id, steps);
}
