/**
 * Arm pose solver for the shipped rig.
 *
 *   npx vite-node tools/arm-solve.ts                  solve every family
 *   npx vite-node tools/arm-solve.ts side press-touch solve named families
 *
 * The rig's rest pose is a relaxed A-pose whose elbows are already bent about
 * 45°, so straightening an arm needs a *negative* elbow angle and a movement
 * that folds the arm has to know where the fold starts. This tool fits the four
 * arm channels (`x`, `y`, `z`) to a *family*: one elbow target, which pins the
 * shoulder, plus one palm target, which pins the elbow angle. A third term keeps
 * the elbow's bend axis pointing out of the body's front plane, so the forearm
 * swings the way a real arm swings instead of cutting a corner through the
 * torso. Sweeping only the elbow angle then walks the hand along one arc.
 *
 * Output goes to `src/motion/armPoses.ts`; the movement library picks the elbow
 * angle of each key from the arcs printed here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Euler, Quaternion, Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { buildPose, type PoseInputs } from '../src/motion/authoring';
import { collectRestSkeleton, restDirection } from '../src/motion/skeleton';
import { applyPose, boneAxes, createMotionState } from '../src/motion/sampler';
import type { MotionDefinition } from '../src/motion/types';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

type Target = [number, number, number];
const vec = (target: Target) => new Vector3().fromArray(target);

interface Family {
  /** Pose the arm belongs to; a 46° hinge moves the shoulder a long way. */
  base?: PoseInputs;
  /** Where the elbow sits with the shoulder in this orientation. */
  elbow: Target;
  /** Where the palm (grip point) sits at the reference elbow angle. */
  palm: Target;
  /** Elbow angle the palm target was chosen at; 0 is the rig's rest bend. */
  hinge: number;
  /** Elbow angles worth printing so the library can pick key values. */
  arc: number[];
  /** Weight of the elbow target against the palm target. */
  weightElbow?: number;
  /** Weight of the bend-plane term (elbow flexing in the body's front plane). */
  weightPlane?: number;
  /** Anatomical elbow axis to prefer, in body axes. Default: body-lateral, -X. */
  axis?: Target;
  /** Weight of the axis term. */
  weightAxis?: number;
  /** Channel triple to seed the local refinement from (the coarse grid misses
   * narrow basins, e.g. the lying press touch whose twist is tightly pinned). */
  seed?: [number, number, number];
}

/**
 * Shoulder joint at rest is (0.199, 1.480, 0.016). The upper arm is 0.271 and
 * the elbow-to-palm reach 0.383, so a straight arm spans 0.654.
 */
const FAMILIES: Record<string, Family> = {
  // A reclined torso needs no extra family: add the recline to the upper arm's
  // `x` channel to put `side` back under gravity.

  /* Elbow-driven: the shoulder stays put and the elbow angle sweeps the hand. */

  // Arm straight down with the elbow tucked at the ribs: curls, press-downs,
  // deadlifts, calf raises. Sweep from hinge -43 (hand at the thigh) through 90
  // (forearm forward) to 120 (hand at the shoulder).
  side: { elbow: [0.22, 1.21, 0.03], palm: [0.24, 0.83, 0.07], hinge: -43, arc: [-43, 0, 45, 90, 120] },
  // Elbows overhead, forearm behind the head: overhead extensions and the
  // kneeling cable crunch. Sweep -40 (arm extended up) to 85 (hand behind head).
  'overhead-ext': { elbow: [0.22, 1.75, 0.01], palm: [0.22, 2.13, 0.01], hinge: -42, arc: [-42, 0, 45, 85] },
  // Barbell across the upper back: hands behind the shoulders, elbows down and
  // back. Holds still for the whole squat.
  'squat-grip': { elbow: [0.35, 1.26, 0.02], palm: [0.2, 1.5, -0.19], hinge: 94, arc: [80, 94, 110], weightAxis: 0.004, weightPlane: 0 },
  // Hanging from a bar: arms nearly straight overhead.
  hang: { elbow: [0.26, 1.73, 0.02], palm: [0.27, 2.11, 0.03], hinge: -42, arc: [-42, 0, 40] },

  /* Shoulder-driven: the whole arm travels and the elbow barely changes. */

  // Lying press (the flat bench body: root -90, knees up). The families are
  // fitted on that base so the targets are world coordinates of the lying
  // figure without the bench's root offset: the shoulder sits at about
  // (0.199, 0.016, -1.480) and the bench pad top at y = -0.10.
  // Touch: the bar rests on the chest (nipple surface + bar radius) at a
  // standard grip width, elbow folded back near the pad, toward the head.
  'press-touch': {
    base: { rootRot: -90, legs: { thigh: -4, knee: 94 } },
    elbow: [0.30, -0.06, -1.72],
    // The knuckle-line palm point sits one hand-length above the seat the bar
    // rests on, so the target is lifted by that offset to land the bar ON the
    // chest surface instead of inside it.
    palm: [0.31, 0.14, -1.38],
    hinge: 110,
    arc: [90, 110, 130],
    // The lying pose's bend plane is x=const, which the generic front-plane and
    // axis heuristics misread as a corner-cutting twist; the targets pin it.
    weightElbow: 1.5,
    weightPlane: 0,
    weightAxis: 0,
    seed: [58.6, -26.2, 91.9],
  },
  // Bench press lockout: arms straight up above the shoulders.
  'press-lockout': { elbow: [0.24, 1.75, 0.03], palm: [0.21, 2.13, 0.05], hinge: -42, arc: [-42, 0, 40] },
  // Lying press, half way up: the elbow is flared out at shoulder height with
  // the bar on one line between the chest and the lockout.
  'press-forward-mid': {
    base: { rootRot: -90, legs: { thigh: -4, knee: 94 } },
    elbow: [0.467, 0.046, -1.473],
    palm: [0.32, 0.397, -1.43],
    hinge: 61,
    arc: [45, 61, 80],
    seed: [2.5, -11.4, 48.1],
  },
  // Lying press, lockout: the whole arm points straight out of the chest. Used
  // with a lying root, so the body's front axis is world up and the bar ends up
  // above the shoulders instead of past the head.
  'press-forward-lockout': {
    base: { rootRot: -90, legs: { thigh: -4, knee: 94 } },
    elbow: [0.254, 0.281, -1.48],
    palm: [0.32, 0.656, -1.48],
    hinge: -42,
    arc: [-42, 0, 40],
    seed: [-89.4, -29.5, 1.4],
  },
  // Shoulder press bottom: elbows out at shoulder height, forearms vertical,
  // dumbbells beside the ears.
  'shoulder-bottom': { elbow: [0.46, 1.43, 0.02], palm: [0.33, 1.76, 0.08], hinge: 95, arc: [60, 95, 125], weightAxis: 0, weightPlane: 0 },
  // Lateral raise top: arm out to the side at shoulder height, elbow softly bent.
  'lateral-top': { elbow: [0.45, 1.43, 0.0], palm: [0.83, 1.38, 0.07], hinge: 25, arc: [-10, 25, 60] },
  // Lateral raise bottom, arm at the side: same family, shallower bend.
  'lateral-bottom': { elbow: [0.23, 1.31, 0.02], palm: [0.3, 1.0, 0.1], hinge: 25, arc: [-10, 25, 60] },
  // Cable fly open: arms wide and slightly forward.
  'fly-open': { elbow: [0.46, 1.42, 0.1], palm: [0.69, 1.25, 0.35], hinge: 35, arc: [10, 35, 70] },
  // Cable fly closed: hands together in front of the chest.
  'fly-closed': { elbow: [0.45, 1.4, 0.03], palm: [0.24, 1.38, 0.35], hinge: 45, arc: [20, 45, 80] },
  // Pull-down top: hands on the bar overhead.
  'pulldown-top': { elbow: [0.28, 1.73, 0.0], palm: [0.31, 2.11, 0.04], hinge: -40, arc: [-40, 0, 40] },
  // Pull-down bottom: bar at the upper chest, elbows down beside the ribs.
  'pulldown-bottom': { elbow: [0.4, 1.3, 0.05], palm: [0.25, 1.53, 0.32], hinge: 85, arc: [55, 85, 120] },
  // Face pull in: hands beside the face with the elbows high.
  'face-pull-in': { elbow: [0.46, 1.5, 0.08], palm: [0.25, 1.58, 0.39], hinge: 80, arc: [50, 80, 110] },
  // Face pull out: arms out in front at shoulder height.
  'face-pull-out': { elbow: [0.47, 1.46, 0.05], palm: [0.74, 1.4, 0.32], hinge: 25, arc: [0, 25, 55] },

  // Seated row extended: arms reaching forward and down to the cable.
  'row-up-extended': { elbow: [0.24, 1.3, 0.2], palm: [0.22, 1.07, 0.51], hinge: -20, arc: [-20, 10, 40] },
  // Seated row pulled: hands beside the waist, elbows behind the ribs.
  'row-up-pulled': { elbow: [0.34, 1.28, -0.14], palm: [0.23, 1.15, 0.2], hinge: 70, arc: [40, 70, 100] },

  /* Bent over: the base pose leans the trunk, so the arms are solved on it. */

  // Arms hanging straight down in world space (rows, reverse fly, RDL finish).
  // The base lean is 72: authored `torso` values land around 45 degrees of real
  // trunk lean at the chest, which is what a bent-over row needs.
  'bent-hang': {
    base: { torso: 72, legs: { pelvis: 6, thigh: -14, knee: 22 } },
    elbow: [0.21, 1.1, 0.18],
    palm: [0.21, 0.72, 0.18],
    hinge: -42,
    arc: [-42, 0, 40],
  },
  // Pulled in: hand beside the hip, elbow up and behind the ribs.
  'bent-pulled': {
    base: { torso: 72, legs: { pelvis: 6, thigh: -14, knee: 22 } },
    elbow: [0.34, 1.18, -0.01],
    palm: [0.24, 0.95, 0.28],
    hinge: 75,
    arc: [40, 75, 110],
  },
  // Reverse fly open: arms straight out to the sides, world horizontal.
  'bent-fly-open': {
    base: { torso: 72, legs: { pelvis: 6, thigh: -14, knee: 22 } },
    elbow: [0.45, 1.29, 0.22],
    palm: [0.83, 1.24, 0.29],
    hinge: 25,
    arc: [0, 25, 55],
  },
  // Reverse fly down: arms hanging under the chest, elbows softly bent.
  'bent-fly-down': {
    base: { torso: 72, legs: { pelvis: 6, thigh: -14, knee: 22 } },
    elbow: [0.21, 1.11, 0.19],
    palm: [0.24, 0.74, 0.26],
    hinge: 25,
    arc: [0, 25, 55],
  },

  /* Romanian deadlift: the trunk is one rigid segment (spine_01 carries the
   * whole lean), so the arms hang straight down in world space at every depth.
   * The bases below are the RDL's own mid and bottom body poses; the targets put
   * the elbow and palm on the vertical line under the shoulder. */

  // RDL half way down: trunk lean 28. Targets are in the solver's unplanted
  // base frame: the shoulder sits at (0.198, 1.403, 0.214) there.
  'rdl-hang-mid': {
    base: { legs: { pelvis: 3, thigh: -28, knee: 24 }, extra: { spine_01: { x: 28 } } },
    elbow: [0.218, 1.132, 0.224],
    palm: [0.228, 0.758, 0.234],
    hinge: -42,
    arc: [-42, 0, 40],
    seed: [-23, -23.7, -30.2],
  },
  // RDL at the bottom: trunk lean 60, hips back. Shoulder at (0.198, 1.217, 0.349).
  'rdl-hang': {
    base: { legs: { pelvis: 5, thigh: -50, knee: 40 }, extra: { spine_01: { x: 60 } } },
    elbow: [0.218, 0.946, 0.359],
    palm: [0.228, 0.572, 0.369],
    hinge: -42,
    arc: [-42, 0, 40],
    seed: [-59.1, -37.7, -8],
  },
};

/* --------------------------------------------------------------------- rig */

const bytes = new Uint8Array(readFileSync('public/models/human.glb'));
const { scene } = buildSkeletonScene(readGlbJson(bytes));
const rest = collectRestSkeleton(scene);
const emptyMotion = {
  id: 'solver',
  name: 'solver',
  summary: '',
  durationSeconds: 1,
  plantBones: [],
  equipment: [],
  fixtures: [],
  standards: [],
  keys: [
    { t: 0, phase: 0, label: '', pose: {} },
    { t: 1, phase: 1, label: '', pose: {} },
  ],
} as unknown as MotionDefinition;
const state = createMotionState(rest, emptyMotion);

const pos = (bone: string) => state.worldPosition.get(bone)!;
const palmPoint = () => pos('index_01_l').clone().add(pos('pinky_01_l')).multiplyScalar(0.5);

/** Rest geometry, measured with no pose applied. */
const humerusRest = restDirection(rest, 'upperarm_l', 'lowerarm_l');
const forearmRest = palmPoint().clone().sub(pos('lowerarm_l')).normalize();
const elbowAxisRest = boneAxes(rest, 'lowerarm_l').hinge!.clone();
const upperLength = pos('upperarm_l').distanceTo(pos('lowerarm_l'));
const foreLength = pos('lowerarm_l').distanceTo(palmPoint());

/**
 * Where the arm ends up for one set of shoulder channels.
 *
 * `x`, `y` and `z` are world-axis swings of the humerus, which is what the
 * sampler composes. The elbow angle is then solved exactly: the forearm sweeps a
 * circle around the rig's own elbow axis, so the closest point on that circle to
 * the palm target is a closed form. The twist channel is left at rest.
 */
function shapeOf(shoulder: Vector3, parent: Quaternion, x: number, y: number, z: number, palmTarget: Vector3): Shape {
  const swingRotation = new Quaternion().setFromEuler(new Euler(x * RAD, y * RAD, z * RAD, 'ZYX'));
  const delta = parent.clone().multiply(swingRotation);
  const humerus = humerusRest.clone().applyQuaternion(delta).normalize();
  const elbow = shoulder.clone().addScaledVector(humerus, upperLength);
  // The bend axis is the swing applied to the rig's own elbow axis; the forearm
  // has to sweep in the plane that contains the body's front axis.
  const axis = elbowAxisRest.clone().applyQuaternion(delta).normalize();
  const front = new Vector3(0, 0, 1).applyQuaternion(parent);
  // Solve the elbow angle: rotate the rest forearm about the fixed elbow axis.
  const inverse = delta.clone().invert();
  const target = palmTarget.clone().sub(elbow).applyQuaternion(inverse);
  const along = elbowAxisRest.clone().multiplyScalar(forearmRest.dot(elbowAxisRest));
  const radial = forearmRest.clone().sub(along);
  const normal = new Vector3().crossVectors(elbowAxisRest, radial);
  const offset = target.clone().sub(along);
  const hinge = Math.min(Math.max(Math.atan2(offset.dot(normal), offset.dot(radial)) * DEG, -60), 150);
  const local = radial
    .clone()
    .multiplyScalar(Math.cos(hinge * RAD))
    .addScaledVector(normal, Math.sin(hinge * RAD))
    .add(along);
  return {
    elbow,
    palm: elbow.clone().addScaledVector(local.clone().applyQuaternion(delta).normalize(), foreLength),
    hinge,
    axis,
    front: Math.abs(axis.dot(front)),
    alignment: axis.dot(new Vector3(-1, 0, 0).applyQuaternion(parent).normalize()),
  };
}

interface Fitted extends Shape {
  x: number;
  y: number;
  z: number;
  palmError: number;
  elbowError: number;
}

function fit(family: Family): Fitted {
  const base = buildPose(family.base ?? {});
  applyPose(state, base);
  const shoulder = pos('upperarm_l').clone();
  const parent = new Quaternion().copy(state.delta.get('upperarm_l')!);
  const elbowTarget = vec(family.elbow);
  const palmTarget = vec(family.palm);
  const weightElbow = family.weightElbow ?? 0.4;
  const weightPlane = family.weightPlane ?? 0.12;
  const weightAxis = family.weightAxis ?? 0.02;
  const axisTarget = vec(family.axis ?? [-1, 0, 0]).normalize();

  const score = (shape: Shape) =>
    shape.palm.distanceTo(palmTarget) ** 2 +
    shape.elbow.distanceTo(elbowTarget) ** 2 * weightElbow +
    shape.front ** 2 * weightPlane +
    (1 - shape.alignment * axisTarget.dot(new Vector3(-1, 0, 0))) * weightAxis;

  // Coarse grid over the whole channel space, then a local refinement from the
  // best few basins: the elbow-plane term makes the cost bumpy enough that a
  // single descent can settle on the wrong shoulder orientation.
  const coarse: { x: number; y: number; z: number; cost: number; shape: Shape }[] = [];
  for (let x = -150; x <= 150; x += 10) {
    for (let y = -95; y <= 95; y += 10) {
      for (let z = -95; z <= 150; z += 10) {
        const shape = shapeOf(shoulder, parent, x, y, z, palmTarget);
        coarse.push({ x, y, z, cost: score(shape), shape });
      }
    }
  }
  coarse.sort((a, b) => a.cost - b.cost);
  const seeds: typeof coarse = [];
  if (family.seed) {
    const shape = shapeOf(shoulder, parent, family.seed[0], family.seed[1], family.seed[2], palmTarget);
    seeds.push({ x: family.seed[0], y: family.seed[1], z: family.seed[2], cost: score(shape), shape });
  }
  for (const candidate of coarse) {
    if (seeds.length >= 8) break;
    if (seeds.every((seed) => Math.abs(seed.x - candidate.x) + Math.abs(seed.y - candidate.y) + Math.abs(seed.z - candidate.z) > 25)) {
      seeds.push(candidate);
    }
  }
  let best = { cost: Number.POSITIVE_INFINITY, x: 0, y: 0, z: 0, shape: shapeOf(shoulder, parent, 0, 0, 0, palmTarget) };
  for (const seed of seeds) {
    let centre = { x: seed.x, y: seed.y, z: seed.z };
    let step = 5;
    let local = { cost: seed.cost, x: seed.x, y: seed.y, z: seed.z, shape: seed.shape };
    for (let pass = 0; pass < 5; pass += 1) {
      const span = step * 2;
      for (let x = centre.x - span; x <= centre.x + span + 1e-9; x += step) {
        for (let y = Math.max(centre.y - span, -95); y <= Math.min(centre.y + span, 95); y += step) {
          for (let z = Math.max(centre.z - span, -95); z <= Math.min(centre.z + span, 150); z += step) {
            const shape = shapeOf(shoulder, parent, x, y, z, palmTarget);
            const cost = score(shape);
            if (cost < local.cost) local = { cost, x, y, z, shape };
          }
        }
      }
      centre = { x: local.x, y: local.y, z: local.z };
      step = Math.max(step / 3, 0.3);
    }
    if (local.cost < best.cost) best = local;
  }
  return {
    ...best.shape,
    x: best.x,
    y: best.y,
    z: best.z,
    palmError: best.shape.palm.distanceTo(palmTarget),
    elbowError: best.shape.elbow.distanceTo(elbowTarget),
  };
}

const r1 = (value: number) => Math.round(value * 10) / 10;
const show = (vector: Vector3) => vector.toArray().map((value) => value.toFixed(2)).join(', ');

function probe(argument: string): void {
  const [x, y, z, hinge] = argument.split(',').map(Number) as [number, number, number, number];
  applyPose(state, { upperarm_l: { x, y, z }, lowerarm_l: { hinge } });
  const realElbow = pos('lowerarm_l').clone();
  const realPalm = palmPoint();
  console.log(`probe ${argument}\n  applied elbow=(${show(realElbow)}) palm=(${show(realPalm)})`);
  // Same channels through the analytic model, with a target that matches the
  // applied palm so the fitted elbow angle should come back as `hinge`.
  applyPose(state, {});
  const shoulder = pos('upperarm_l').clone();
  const parent = new Quaternion().copy(state.delta.get('upperarm_l')!);
  const shape = shapeOf(shoulder, parent, x, y, z, realPalm);
  console.log(
    `  model   elbow=(${show(shape.elbow)}) palm=(${show(shape.palm)}) hinge=${shape.hinge.toFixed(1)}` +
    `  elbowErr=${shape.elbow.distanceTo(realElbow).toFixed(4)} palmErr=${shape.palm.distanceTo(realPalm).toFixed(4)}`,
  );
  void hinge;
}

function main(): void {
  const probeArgument = process.argv.find((argument) => argument.startsWith('--probe='));
  if (probeArgument) {
    probe(probeArgument.slice('--probe='.length));
    return;
  }
  const names = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  const wanted = names.length > 0 ? names : Object.keys(FAMILIES);
  applyPose(state, {});
  console.log(
    `shoulder=${show(pos('upperarm_l'))} upperArm=${upperLength.toFixed(3)} elbowToPalm=${foreLength.toFixed(3)}`,
  );
  console.log(`elbow hinge axis at rest=${show(elbowAxisRest)}\n`);
  const written: string[] = [];
  for (const name of wanted) {
    const family = FAMILIES[name];
    if (!family) {
      console.log(`unknown family ${name}`);
      continue;
    }
    const solved = fit(family);
    console.log(name);
    console.log(
      `  upperarm: { x: ${r1(solved.x)}, y: ${r1(solved.y)}, z: ${r1(solved.z)} }` +
      `  hinge=${r1(solved.hinge)}  palmErr=${solved.palmError.toFixed(3)}  elbowErr=${solved.elbowError.toFixed(3)}`,
    );
    console.log(
      `  elbow=(${show(solved.elbow)}) palm=(${show(solved.palm)})` +
      `  hingeAxis=(${show(solved.axis)}) planeTilt=${solved.front.toFixed(2)} align=${solved.alignment.toFixed(2)}` +
      `  target |E-S|=${vec(family.elbow).distanceTo(pos('upperarm_l')).toFixed(3)}` +
      ` |P-E|=${vec(family.palm).distanceTo(vec(family.elbow)).toFixed(3)}`,
    );
    if (family.arc.length > 0) {
      applyPose(state, buildPose(family.base ?? {}));
      const shoulder = pos('upperarm_l').clone();
      const parent = new Quaternion().copy(state.delta.get('upperarm_l')!);
      const target = vec(family.palm);
      const lines = family.arc.map((hinge) => {
        const delta = new Quaternion()
          .copy(parent)
          .multiply(new Quaternion().setFromEuler(new Euler(solved.x * RAD, solved.y * RAD, solved.z * RAD, 'ZYX')));
        const humerus = humerusRest.clone().applyQuaternion(delta).normalize();
        const elbow = shoulder.clone().addScaledVector(humerus, upperLength);
        const axis = elbowAxisRest.clone().applyQuaternion(delta).normalize();
        const forearm = forearmRest.clone().applyQuaternion(delta).applyAxisAngle(axis, hinge * RAD);
        const palm = elbow.clone().addScaledVector(forearm, foreLength);
        return `    hinge=${String(hinge).padStart(4)}  palm=(${show(palm)})  reach=${palm.distanceTo(target).toFixed(2)}`;
      });
      console.log(lines.join('\n'));
    }
    written.push(
      `  '${name}': { upperarm: { x: ${r1(solved.x)}, y: ${r1(solved.y)}, z: ${r1(solved.z)} }, ` +
      `lowerarm: { hinge: ${r1(solved.hinge)} } },`,
    );
  }
  const header =
    '// Generated by tools/arm-solve.ts — do not edit by hand.\n' +
    '// One entry per arm family: the shoulder channels fitted on the rig plus the\n' +
    '// elbow angle the family was fitted at. Pick elbow angles per key from the arc\n' +
    '// the tool prints for each family.\n\n';
  writeFileSync('src/motion/armPoses.ts', `${header}export const armPoses = {\n${written.join('\n')}\n} as const;\n`);
  console.log(`\nwrote src/motion/armPoses.ts with ${written.length} families`);
}

main();
