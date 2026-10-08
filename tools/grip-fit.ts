/**
 * Fits the grip against the shipped mesh (dev tool, not shipped).
 *
 *   npx vite-node tools/grip-fit.ts                 # score the current numbers
 *   npx vite-node tools/grip-fit.ts --sweep         # search seat/skin/finger curls
 *   npx vite-node tools/grip-fit.ts barbell-squat   # one movement, every phase
 *
 * A hand only reads as holding a bar if three things hold at every phase of the
 * loop: the knuckles sit just outside the shaft, the finger tips close around the
 * far side of it, and no phalanx passes through the metal. This walks the loops,
 * measures all three against the placement `placeEquipment` actually produces,
 * and prints the numbers so the winners can be pasted into `src/motion/sampler.ts`.
 */
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { buildSkeletonScene, readGlbJson } from '../src/motion/glbNodes';
import { collectRestSkeleton } from '../src/motion/skeleton';
import {
  CURL,
  GRIP,
  createMotionState,
  handleRadius,
  handFrame,
  sampleMotion,
  type FingerCurl,
  type MotionState,
} from '../src/motion/sampler';
import { motions } from '../src/motion/library';

const { scene } = buildSkeletonScene(readGlbJson(new Uint8Array(readFileSync('public/models/human.glb'))));
const rest = collectRestSkeleton(scene);

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const option = (name: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : null;
};
const sweeping = process.argv.includes('--sweep');
const movements = args.length > 0 ? args : Object.keys(motions);
const BARBELL = movements.filter((id) => motions[id]!.equipment.some((item) => item.kind === 'barbell'));
const PHASES = [0, 0.2, 0.4, 0.6, 0.8];
const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

const point = (state: MotionState, name: string) => state.worldPosition.get(name)!;

const distance = (p: Vector3, origin: Vector3, axis: Vector3) => {
  const rel = new Vector3().subVectors(p, origin);
  return rel.addScaledVector(axis, -rel.dot(axis)).length();
};

/** Distance from a bone to the shaft centre-line, sampled along the segment. */
function segmentDistance(state: MotionState, from: string, to: string, origin: Vector3, axis: Vector3) {
  let worst = Infinity;
  for (let step = 0; step <= 4; step += 1) {
    const p = new Vector3().lerpVectors(point(state, from), point(state, to), step / 4);
    worst = Math.min(worst, distance(p, origin, axis));
  }
  return worst;
}

interface Measurement {
  id: string;
  phase: number;
  side: 'l' | 'r';
  /** Worst distance from a knuckle to the shaft centre-line. */
  knuckle: number;
  /** Worst distance from a phalanx centre-line to the shaft centre-line. */
  phalanx: number;
  /** Distance from each finger tip to the shaft centre-line. */
  tips: Record<string, number>;
  thumbTip: number;
  /** How far the palm seat is from the shaft the bar actually occupies. */
  seat: number;
}

/**
 * The bar a barbell movement produces: one shaft through both palm seats, exactly
 * as `placeEquipment` builds it.
 */
function barOf(state: MotionState, radius: number) {
  const left = handFrame(state, 'l', radius);
  const right = handFrame(state, 'r', radius);
  const axis = new Vector3().subVectors(left.position, right.position).normalize();
  const position = new Vector3().addVectors(left.position, right.position).multiplyScalar(0.5);
  return { axis, position, left, right };
}

function measure(id: string, phase: number): Measurement[] {
  const motion = motions[id]!;
  const state = createMotionState(rest, motion);
  sampleMotion(state, phase);
  const radius = handleRadius('barbell');
  const { axis, position, left, right } = barOf(state, radius);
  const out: Measurement[] = [];
  for (const [side, frame] of [
    ['l', left],
    ['r', right],
  ] as const) {
    const tips: Record<string, number> = {};
    for (const finger of FINGERS) {
      tips[finger] = distance(point(state, `${finger}_03_${side}`), position, axis);
    }
    out.push({
      id,
      phase,
      side,
      knuckle: Math.min(...FINGERS.map((finger) => distance(point(state, `${finger}_01_${side}`), position, axis))),
      phalanx: Math.min(
        ...FINGERS.flatMap((finger) => [
          segmentDistance(state, `${finger}_01_${side}`, `${finger}_02_${side}`, position, axis),
          segmentDistance(state, `${finger}_02_${side}`, `${finger}_03_${side}`, position, axis),
        ]),
      ),
      tips,
      thumbTip: distance(point(state, `thumb_03_${side}`), position, axis),
      seat: distance(frame.position, position, axis),
    });
  }
  return out;
}

/** How badly one measurement misses the wanted band. Lower is better. */
function cost(rows: Measurement[], radius: number) {
  const band = (value: number, low: number, high: number) =>
    value < low ? low - value : value > high ? value - high : 0;
  let score = 0;
  let worst = { value: 0, where: '' };
  const add = (value: number, where: string) => {
    score += value;
    if (value > worst.value) worst = { value, where };
  };
  for (const row of rows) {
    // The knuckle sits on the shaft's surface: the shaft may touch it, never swallow it.
    add(band(row.knuckle, radius + 0.004, radius + 0.02) * 6, `${row.id} p${row.phase} ${row.side} knuckle`);
    add(band(row.phalanx, radius + 0.003, 0.045) * 6, `${row.id} p${row.phase} ${row.side} phalanx`);
    for (const [finger, tip] of Object.entries(row.tips)) {
      add(band(tip, radius + 0.006, radius + 0.016) * 3, `${row.id} p${row.phase} ${row.side} ${finger} tip`);
    }
    add(band(row.thumbTip, radius + 0.003, radius + 0.02) * 2, `${row.id} p${row.phase} ${row.side} thumb`);
    add(band(row.seat, 0, 0.012) * 2, `${row.id} p${row.phase} ${row.side} seat`);
  }
  return { score, worst };
}

function report(rows: Measurement[], radius: number, label: string) {
  const knuckle = Math.min(...rows.map((r) => r.knuckle));
  const phalanx = Math.min(...rows.map((r) => r.phalanx));
  const tipMin = Math.min(...rows.flatMap((r) => Object.values(r.tips)));
  const tipMax = Math.max(...rows.flatMap((r) => Object.values(r.tips)));
  const thumb = rows.map((r) => r.thumbTip);
  const seat = Math.max(...rows.map((r) => r.seat));
  const { score, worst } = cost(rows, radius);
  console.log(
    label.padEnd(22),
    'knuckle', knuckle.toFixed(3),
    '| phalanx', phalanx.toFixed(3),
    '| tips', tipMin.toFixed(3), '-', tipMax.toFixed(3),
    '| thumb', Math.min(...thumb).toFixed(3), '-', Math.max(...thumb).toFixed(3),
    '| seat', seat.toFixed(3),
    '| cost', score.toFixed(3),
    worst.value > 0 ? `(worst ${worst.value.toFixed(3)} ${worst.where})` : '',
  );
  return score;
}

const collect = () => BARBELL.flatMap((id) => PHASES.flatMap((phase) => measure(id, phase)));

/** Per-finger detail, for reading which joint of which finger misses the shaft. */
function detail(id: string, phase: number) {
  const motion = motions[id]!;
  const state = createMotionState(rest, motion);
  sampleMotion(state, phase);
  const { axis, position, left, right } = barOf(state, handleRadius('barbell'));
  for (const [side, frame] of [['l', left], ['r', right]] as const) {
    const parts = FINGERS.map((finger) => {
      const tip = distance(point(state, `${finger}_03_${side}`), position, axis);
      const mid = segmentDistance(state, `${finger}_02_${side}`, `${finger}_03_${side}`, position, axis);
      const prox = segmentDistance(state, `${finger}_01_${side}`, `${finger}_02_${side}`, position, axis);
      return `${finger[0]!} ${prox.toFixed(3)}/${mid.toFixed(3)}/${tip.toFixed(3)}`;
    });
    const thumb = distance(point(state, `thumb_03_${side}`), position, axis);
    console.log(id, `p${phase}`, side, parts.join(' '), `| thumb ${thumb.toFixed(3)}`, `| seat ${distance(frame.position, position, axis).toFixed(3)}`);
  }
}
const radius = handleRadius('barbell');

const askedSeat = option('seat');
const askedSkin = option('skin');
if (askedSeat !== null) GRIP.seat = askedSeat;
if (askedSkin !== null) GRIP.skin = askedSkin;

if (process.argv.includes('--scan')) {
  console.log('scan: fingers as authored', JSON.stringify(CURL.barbell));
  for (const seat of [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1])
    for (const skin of [0.006, 0.01, 0.014]) {
      GRIP.seat = seat;
      GRIP.skin = skin;
      report(collect(), radius, `seat ${seat} skin ${skin}`);
    }
} else if (process.argv.includes('--fit')) {
  // Each finger is independent: nothing about the index depends on the little finger,
  // so each is fitted on its own against every barbell loop, then reported.
  const best: Record<string, { angles: [number, number, number]; cost: number }> = {};
  const start = structuredClone(CURL.barbell);
  for (const finger of ['index', 'middle', 'ring', 'pinky', 'thumb'] as const) {
    let winner = { angles: [start[finger]!.mcp, start[finger]!.pip, start[finger]!.dip] as [number, number, number], cost: Infinity };
    const mcpMax = finger === 'thumb' ? 60 : 110;
    const pipMax = finger === 'thumb' ? 60 : 110;
    const dipMax = finger === 'thumb' ? 45 : 70;
    for (let mcp = 20; mcp <= mcpMax; mcp += 5)
      for (let pip = 0; pip <= pipMax; pip += 5)
        for (let dip = 0; dip <= dipMax; dip += 5) {
          CURL.barbell[finger] = { mcp, pip, dip };
          const rows = collect();
          let score = 0;
          for (const row of rows) {
            const phalanx = row.phalanx;
            score += Math.max(0, radius + 0.006 - phalanx) * 60;
            const tip = finger === 'thumb' ? row.thumbTip : row.tips[finger]!;
            score += Math.max(0, radius + 0.006 - tip) * 40 + Math.max(0, tip - (radius + 0.02)) * 20;
          }
          if (score < winner.cost) winner = { angles: [mcp, pip, dip], cost: score };
        }
    CURL.barbell[finger] = { mcp: winner.angles[0], pip: winner.angles[1], dip: winner.angles[2] };
    best[finger] = winner;
    console.log(finger.padEnd(7), winner.angles.join('/').padEnd(12), 'cost', winner.cost.toFixed(3));
  }
  console.log('fitted', JSON.stringify(CURL.barbell));
  report(collect(), radius, 'fitted');
} else if (!sweeping) {
  console.log(`grip: seat ${GRIP.seat} skin ${GRIP.skin} | barbell shaft radius ${radius}`);
  console.log('fingers', JSON.stringify(CURL.barbell));
  for (const id of BARBELL) report(measure(id, 0), radius, id);
  report(collect(), radius, 'every movement');
  if (process.argv.includes('--detail'))
    for (const id of BARBELL) for (const phase of PHASES) detail(id, phase);
} else {
  const FINGER_SET = ['index', 'middle', 'ring', 'pinky'] as const;
  type Key = 'seat' | 'skin' | `${(typeof FINGER_SET)[number]}.${'mcp' | 'pip' | 'dip'}` | `thumb.${'mcp' | 'pip' | 'dip'}`;
  const read = (key: Key): number => {
    if (key === 'seat') return GRIP.seat;
    if (key === 'skin') return GRIP.skin;
    const [finger, joint] = key.split('.') as [string, 'mcp' | 'pip' | 'dip'];
    return (CURL.barbell[finger] as FingerCurl)[joint];
  };
  const write = (key: Key, value: number) => {
    if (key === 'seat') GRIP.seat = value;
    else if (key === 'skin') GRIP.skin = value;
    else {
      const [finger, joint] = key.split('.') as [string, 'mcp' | 'pip' | 'dip'];
      (CURL.barbell[finger] as FingerCurl)[joint] = value;
    }
  };
  const keys: Key[] = [
    'seat',
    'skin',
    ...FINGER_SET.flatMap((finger) => [`${finger}.mcp`, `${finger}.pip`, `${finger}.dip`] as Key[]),
    'thumb.mcp',
    'thumb.pip',
    'thumb.dip',
  ];
  report(collect(), radius, 'start');
  let current = cost(collect(), radius).score;
  for (let round = 0; round < 3; round += 1) {
    for (const key of keys) {
      const best = { value: read(key), cost: current };
      for (const step of [12, 6, 3, -3, -6, -12]) {
        const value = read(key) + step;
        if (value < 0 || (key !== 'seat' && value > 130)) continue;
        write(key, value);
        const score = cost(collect(), radius).score;
        if (score < best.cost) {
          best.value = value;
          best.cost = score;
        }
      }
      write(key, best.value);
      current = best.cost;
    }
    console.log('round', round, 'cost', current.toFixed(3));
  }
  console.log('fitted', JSON.stringify({ seat: GRIP.seat, skin: GRIP.skin, curl: CURL.barbell }));
  report(collect(), radius, 'winner');
}
