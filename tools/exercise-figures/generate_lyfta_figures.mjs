import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPose } from './render.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const outDir = join(root, 'public', 'exercise-images');

// Common equipment definitions
const RIG = [
  { t: 'pullbar', x: 240, y: 30, len: 120 },
  { t: 'post', x: 180, y: 30, h: 260 },
  { t: 'post', x: 300, y: 30, h: 260 },
];
const FLAT_BENCH_SIDE = [
  { t: 'bench', x: 240, y: 220, w: 180 },
];
const BENCH_END = [{ t: 'benchEnd', x: 240, y: 206 }];
const GROUND_MAT = [{ t: 'box', x: 240, y: 295, w: 260, h: 4 }];
const STEP_BOX = [{ t: 'box', x: 260, y: 240, w: 90, h: 56 }];

// Pose factory helpers
const standingStart = (uarm = 270, farm = 270, equip = []) => ({
  root: [240, 124],
  torso: 90,
  thigh: 270,
  shin: 270,
  foot: 0,
  uarm,
  farm,
  equip,
});

const seatedStart = (uarm = 270, farm = 270, equip = []) => ({
  root: [210, 212],
  torso: 90,
  thigh: 0,
  shin: 270,
  foot: 0,
  uarm,
  farm,
  equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'post', x: 180, y: 130, h: 100 }, ...equip],
});

export const LYFTA_POSES = {
  // Push-up
  'push-up': {
    start: {
      root: [300, 230],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 265,
      farm: 265,
      equip: GROUND_MAT,
    },
    main: {
      root: [300, 255],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 215,
      farm: 310,
      equip: GROUND_MAT,
    },
  },
  'diamond-push-up': {
    start: {
      root: [300, 230],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 265,
      farm: 265,
      equip: GROUND_MAT,
    },
    main: {
      root: [300, 258],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 200,
      farm: 325,
      equip: GROUND_MAT,
    },
  },
  'incline-push-up': {
    start: {
      root: [280, 210],
      torso: 145,
      thigh: 145,
      shin: 145,
      foot: 235,
      uarm: 245,
      farm: 245,
      equip: [{ t: 'box', x: 180, y: 220, w: 60, h: 76 }],
    },
    main: {
      root: [280, 235],
      torso: 145,
      thigh: 145,
      shin: 145,
      foot: 235,
      uarm: 195,
      farm: 290,
      equip: [{ t: 'box', x: 180, y: 220, w: 60, h: 76 }],
    },
  },
  'decline-push-up': {
    start: {
      root: [320, 195],
      torso: 190,
      thigh: 190,
      shin: 190,
      foot: 270,
      uarm: 275,
      farm: 275,
      equip: [{ t: 'box', x: 330, y: 230, w: 60, h: 66 }],
    },
    main: {
      root: [320, 220],
      torso: 190,
      thigh: 190,
      shin: 190,
      foot: 270,
      uarm: 230,
      farm: 320,
      equip: [{ t: 'box', x: 330, y: 230, w: 60, h: 66 }],
    },
  },
  // Flyes
  'dumbbell-chest-fly': {
    start: {
      view: 'end',
      arms: { L: [10, 20], R: [10, 20] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
    main: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
  },
  'incline-dumbbell-fly': {
    start: {
      view: 'end',
      arms: { L: [15, 25], R: [15, 25] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
    main: {
      view: 'end',
      arms: { L: [75, 85], R: [75, 85] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
  },
  'decline-dumbbell-fly': {
    start: {
      view: 'end',
      arms: { L: [5, 15], R: [5, 15] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
    main: {
      view: 'end',
      arms: { L: [70, 75], R: [70, 75] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
  },
  'pec-deck-fly': {
    start: {
      root: [210, 212],
      torso: 90,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 170,
      farm: 170,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'post', x: 180, y: 130, h: 100 }],
    },
    main: {
      root: [210, 212],
      torso: 90,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 0,
      farm: 0,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'post', x: 180, y: 130, h: 100 }],
    },
  },
  'incline-cable-fly': {
    start: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 230,
      farm: 230,
      equip: [{ t: 'cable', at: 'grip', anchor: [180, 290] }],
    },
    main: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 45,
      farm: 45,
      equip: [{ t: 'cable', at: 'grip', anchor: [180, 290] }],
    },
  },
  'cable-crossover': {
    start: {
      root: [240, 124],
      torso: 75,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 140,
      farm: 140,
      equip: [{ t: 'cable', at: 'grip', anchor: [160, 40] }],
    },
    main: {
      root: [240, 124],
      torso: 75,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 295,
      farm: 295,
      equip: [{ t: 'cable', at: 'grip', anchor: [160, 40] }],
    },
  },
  'cable-chest-press': {
    start: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 195,
      farm: 285,
      equip: [{ t: 'cable', at: 'grip', anchor: [170, 120] }],
    },
    main: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 10,
      farm: 10,
      equip: [{ t: 'cable', at: 'grip', anchor: [170, 120] }],
    },
  },
  'incline-machine-press': {
    start: {
      root: [205, 215],
      torso: 65,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 215,
      farm: 300,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }],
    },
    main: {
      root: [205, 215],
      torso: 65,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 45,
      farm: 45,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }],
    },
  },
  'decline-barbell-press': {
    start: {
      view: 'end',
      arms: { L: [75, 75], R: [75, 75] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260 }],
    },
    main: {
      view: 'end',
      arms: { L: [-30, 85], R: [-30, 85] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260 }],
    },
  },
  'barbell-floor-press': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [GROUND_MAT[0], { t: 'bar', at: 'grip', len: 260 }],
    },
    main: {
      view: 'end',
      arms: { L: [0, 90], R: [0, 90] },
      equip: [GROUND_MAT[0], { t: 'bar', at: 'grip', len: 260 }],
    },
  },
  'close-grip-bench-press': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260, inset: 45 }],
    },
    main: {
      view: 'end',
      arms: { L: [-15, 88], R: [-15, 88] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260, inset: 45 }],
    },
  },
  'svend-press': {
    start: {
      ...standingStart(240, 60, [{ t: 'box', x: 250, y: 80, w: 10, h: 30 }]),
    },
    main: {
      ...standingStart(10, 10, [{ t: 'box', x: 290, y: 65, w: 10, h: 30 }]),
    },
  },
  'single-arm-landmine-press': {
    start: {
      ...standingStart(240, 65, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(40, 40, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'weighted-chest-dip': {
    start: {
      root: [240, 130],
      torso: 70,
      thigh: 240,
      shin: 70,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'post', x: 210, y: 120, h: 170 }, { t: 'post', x: 270, y: 120, h: 170 }],
    },
    main: {
      root: [240, 185],
      torso: 65,
      thigh: 240,
      shin: 70,
      foot: 0,
      uarm: 200,
      farm: 300,
      equip: [{ t: 'post', x: 210, y: 120, h: 170 }, { t: 'post', x: 270, y: 120, h: 170 }],
    },
  },
  // Back & Pull movements
  'pull-up': {
    start: {
      root: [240, 160],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 90,
      farm: 90,
      equip: RIG,
    },
    main: {
      root: [240, 95],
      torso: 95,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 255,
      farm: 80,
      equip: RIG,
    },
  },
  'chin-up': {
    start: {
      root: [240, 160],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 90,
      farm: 90,
      equip: RIG,
    },
    main: {
      root: [240, 95],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 90,
      equip: RIG,
    },
  },
  'straight-arm-pulldown': {
    start: {
      root: [240, 130],
      torso: 70,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 50,
      farm: 50,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 20] }, { t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [240, 130],
      torso: 70,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 275,
      farm: 275,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 20] }, { t: 'barSide', at: 'grip' }],
    },
  },
  't-bar-row': {
    start: {
      root: [205, 140],
      torso: 45,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [205, 140],
      torso: 45,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 220,
      farm: 70,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'conventional-deadlift': {
    start: {
      root: [200, 155],
      torso: 40,
      thigh: 300,
      shin: 250,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [240, 124],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'trap-bar-deadlift': {
    start: {
      root: [210, 150],
      torso: 50,
      thigh: 310,
      shin: 255,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 235, y: 230, w: 25, h: 25 }],
    },
    main: {
      root: [240, 124],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 240, y: 175, w: 25, h: 25 }],
    },
  },
  'good-morning': {
    start: {
      ...standingStart(245, 80, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      root: [200, 130],
      torso: 35,
      thigh: 285,
      shin: 270,
      foot: 0,
      uarm: 245,
      farm: 80,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'pendlay-row': {
    start: {
      root: [200, 135],
      torso: 15,
      thigh: 290,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [200, 135],
      torso: 15,
      thigh: 290,
      shin: 265,
      foot: 0,
      uarm: 210,
      farm: 60,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'meadows-row': {
    start: {
      root: [205, 140],
      torso: 40,
      thigh: 285,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [205, 140],
      torso: 40,
      thigh: 285,
      shin: 265,
      foot: 0,
      uarm: 220,
      farm: 70,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'single-arm-cable-row': {
    start: {
      ...seatedStart(0, 0, [{ t: 'cable', at: 'grip', anchor: [290, 175] }]),
    },
    main: {
      ...seatedStart(240, 30, [{ t: 'cable', at: 'grip', anchor: [290, 175] }]),
    },
  },
  'wide-grip-seated-cable-row': {
    start: {
      ...seatedStart(10, 10, [{ t: 'cable', at: 'grip', anchor: [290, 170] }]),
    },
    main: {
      ...seatedStart(225, 45, [{ t: 'cable', at: 'grip', anchor: [290, 170] }]),
    },
  },
  'inverted-row': {
    start: {
      root: [260, 240],
      torso: 150,
      thigh: 150,
      shin: 150,
      foot: 240,
      uarm: 80,
      farm: 80,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [240, 185],
      torso: 150,
      thigh: 150,
      shin: 150,
      foot: 240,
      uarm: 240,
      farm: 70,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'rack-pull': {
    start: {
      root: [215, 140],
      torso: 55,
      thigh: 290,
      shin: 260,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }, { t: 'post', x: 230, y: 190, h: 105 }],
    },
    main: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }, { t: 'post', x: 230, y: 190, h: 105 }]),
    },
  },
  'kneeling-lat-pulldown': {
    start: {
      root: [240, 220],
      torso: 90,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 85,
      farm: 85,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 20] }],
    },
    main: {
      root: [240, 220],
      torso: 90,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 250,
      farm: 50,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 20] }],
    },
  },
  'hyperextension': {
    start: {
      root: [210, 195],
      torso: 300,
      thigh: 220,
      shin: 220,
      foot: 310,
      uarm: 280,
      farm: 280,
      equip: [{ t: 'box', x: 200, y: 205, w: 50, h: 90 }],
    },
    main: {
      root: [210, 195],
      torso: 40,
      thigh: 220,
      shin: 220,
      foot: 310,
      uarm: 280,
      farm: 280,
      equip: [{ t: 'box', x: 200, y: 205, w: 50, h: 90 }],
    },
  },
  'dumbbell-pullover': {
    start: {
      view: 'end',
      arms: { L: [80, 80], R: [80, 80] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grip' }],
    },
    main: {
      view: 'end',
      arms: { L: [160, 160], R: [160, 160] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grip' }],
    },
  },
  'barbell-pullover': {
    start: {
      view: 'end',
      arms: { L: [80, 80], R: [80, 80] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 220 }],
    },
    main: {
      view: 'end',
      arms: { L: [165, 165], R: [165, 165] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 220 }],
    },
  },
  'chest-supported-dumbbell-row': {
    start: {
      root: [210, 180],
      torso: 45,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 225, y: 170, w: 80, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [210, 180],
      torso: 45,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 215,
      farm: 65,
      equip: [{ t: 'box', x: 225, y: 170, w: 80, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
  },

  // Shoulders & Traps
  'dumbbell-front-raise': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...standingStart(0, 0, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },
  'barbell-front-raise': {
    start: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(0, 0, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'plate-front-raise': {
    start: {
      ...standingStart(270, 270, [{ t: 'box', x: 245, y: 180, w: 10, h: 36 }]),
    },
    main: {
      ...standingStart(0, 0, [{ t: 'box', x: 285, y: 65, w: 10, h: 36 }]),
    },
  },
  'arnold-press': {
    start: {
      ...seatedStart(250, 75, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...seatedStart(90, 90, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },
  'behind-the-neck-press': {
    start: {
      ...seatedStart(265, 85, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...seatedStart(90, 90, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'seated-barbell-overhead-press': {
    start: {
      ...seatedStart(255, 75, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...seatedStart(90, 90, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'bent-over-dumbbell-reverse-fly': {
    start: {
      root: [205, 140],
      torso: 40,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [205, 140],
      torso: 40,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 140,
      farm: 140,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'cable-rear-delt-fly': {
    start: {
      ...standingStart(0, 0, [{ t: 'cable', at: 'grip', anchor: [280, 70] }]),
    },
    main: {
      ...standingStart(180, 180, [{ t: 'cable', at: 'grip', anchor: [280, 70] }]),
    },
  },
  'dumbbell-rear-delt-row': {
    start: {
      root: [205, 140],
      torso: 40,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [205, 140],
      torso: 40,
      thigh: 280,
      shin: 265,
      foot: 0,
      uarm: 170,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'cable-upright-row': {
    start: {
      ...standingStart(270, 270, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
    main: {
      ...standingStart(165, 305, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
  },
  'barbell-upright-row': {
    start: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(165, 305, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'dumbbell-shrug': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [240, 118],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'barbell-shrug': {
    start: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      root: [240, 118],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'cable-y-raise': {
    start: {
      ...standingStart(270, 270, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
    main: {
      ...standingStart(55, 55, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
  },
  'lean-away-cable-lateral-raise': {
    start: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'cable', at: 'grip', anchor: [190, 290] }],
    },
    main: {
      root: [240, 124],
      torso: 80,
      thigh: 265,
      shin: 265,
      foot: 0,
      uarm: 0,
      farm: 0,
      equip: [{ t: 'cable', at: 'grip', anchor: [190, 290] }],
    },
  },
  'face-away-cable-lateral-raise': {
    start: {
      ...standingStart(260, 260, [{ t: 'cable', at: 'grip', anchor: [210, 290] }]),
    },
    main: {
      ...standingStart(5, 5, [{ t: 'cable', at: 'grip', anchor: [210, 290] }]),
    },
  },
  'landmine-lateral-raise': {
    start: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(0, 0, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'dumbbell-scaption': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...standingStart(25, 25, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },

  // Biceps & Forearms
  'preacher-curl': {
    start: {
      root: [210, 215],
      torso: 80,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 330,
      farm: 330,
      equip: [{ t: 'box', x: 230, y: 175, w: 45, h: 45 }, { t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [210, 215],
      torso: 80,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 330,
      farm: 110,
      equip: [{ t: 'box', x: 230, y: 175, w: 45, h: 45 }, { t: 'barSide', at: 'grip' }],
    },
  },
  'dumbbell-preacher-curl': {
    start: {
      root: [210, 215],
      torso: 80,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 330,
      farm: 330,
      equip: [{ t: 'box', x: 230, y: 175, w: 45, h: 45 }, { t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [210, 215],
      torso: 80,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 330,
      farm: 110,
      equip: [{ t: 'box', x: 230, y: 175, w: 45, h: 45 }, { t: 'dumbbell', at: 'grip' }],
    },
  },
  'concentration-curl': {
    start: {
      root: [210, 215],
      torso: 50,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 280,
      farm: 280,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [210, 215],
      torso: 50,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 280,
      farm: 90,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
  },
  'reverse-barbell-curl': {
    start: {
      ...standingStart(275, 275, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(275, 80, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'spider-curl': {
    start: {
      root: [210, 180],
      torso: 45,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 225, y: 170, w: 80, h: 14 }, { t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [210, 180],
      torso: 45,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 85,
      equip: [{ t: 'box', x: 225, y: 170, w: 80, h: 14 }, { t: 'barSide', at: 'grip' }],
    },
  },
  'cable-rope-hammer-curl': {
    start: {
      ...standingStart(275, 275, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
    main: {
      ...standingStart(275, 80, [{ t: 'cable', at: 'grip', anchor: [240, 290] }]),
    },
  },
  'bayesian-cable-curl': {
    start: {
      root: [240, 124],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 220,
      farm: 220,
      equip: [{ t: 'cable', at: 'grip', anchor: [170, 290] }],
    },
    main: {
      root: [240, 124],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 240,
      farm: 70,
      equip: [{ t: 'cable', at: 'grip', anchor: [170, 290] }],
    },
  },
  'high-cable-biceps-curl': {
    start: {
      ...standingStart(0, 0, [{ t: 'cable', at: 'grip', anchor: [280, 50] }]),
    },
    main: {
      ...standingStart(0, 160, [{ t: 'cable', at: 'grip', anchor: [280, 50] }]),
    },
  },
  'zottman-curl': {
    start: {
      ...standingStart(275, 275, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...standingStart(275, 80, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },
  'seated-incline-hammer-curl': {
    start: {
      root: [210, 215],
      torso: 65,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 260,
      farm: 260,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [210, 215],
      torso: 65,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 260,
      farm: 70,
      equip: [{ t: 'box', x: 190, y: 220, w: 70, h: 14 }, { t: 'dumbbell', at: 'grip' }],
    },
  },
  'barbell-drag-curl': {
    start: {
      ...standingStart(270, 270, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(230, 75, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'waiter-curl': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...standingStart(275, 75, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },
  'seated-barbell-wrist-curl': {
    start: {
      ...seatedStart(290, 290, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...seatedStart(290, 20, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'seated-reverse-wrist-curl': {
    start: {
      ...seatedStart(290, 290, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...seatedStart(290, 20, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'farmers-walk': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [240, 124],
      torso: 90,
      thigh: 290,
      shin: 250,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },

  // Triceps
  'skull-crusher': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 180 }],
    },
    main: {
      view: 'end',
      arms: { L: [75, 175], R: [75, 175] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 180 }],
    },
  },
  'dumbbell-skull-crusher': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
    main: {
      view: 'end',
      arms: { L: [75, 175], R: [75, 175] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
  },
  'bench-dip': {
    start: {
      root: [230, 195],
      torso: 90,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 200, y: 220, w: 40, h: 76 }],
    },
    main: {
      root: [230, 235],
      torso: 90,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 195,
      farm: 285,
      equip: [{ t: 'box', x: 200, y: 220, w: 40, h: 76 }],
    },
  },
  'parallel-bar-dip': {
    start: {
      root: [240, 130],
      torso: 90,
      thigh: 240,
      shin: 70,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'post', x: 210, y: 120, h: 170 }, { t: 'post', x: 270, y: 120, h: 170 }],
    },
    main: {
      root: [240, 185],
      torso: 90,
      thigh: 240,
      shin: 70,
      foot: 0,
      uarm: 190,
      farm: 280,
      equip: [{ t: 'post', x: 210, y: 120, h: 170 }, { t: 'post', x: 270, y: 120, h: 170 }],
    },
  },
  'dumbbell-kickback': {
    start: {
      root: [210, 170],
      torso: 15,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 180,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
    main: {
      root: [210, 170],
      torso: 15,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 180,
      farm: 180,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'single-arm-cable-kickback': {
    start: {
      root: [210, 170],
      torso: 15,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 180,
      farm: 270,
      equip: [{ t: 'cable', at: 'grip', anchor: [280, 170] }],
    },
    main: {
      root: [210, 170],
      torso: 15,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 180,
      farm: 180,
      equip: [{ t: 'cable', at: 'grip', anchor: [280, 170] }],
    },
  },
  'single-arm-overhead-dumbbell-triceps': {
    start: {
      ...standingStart(85, 260, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      ...standingStart(85, 85, [{ t: 'dumbbell', at: 'grip' }]),
    },
  },
  'standing-french-press': {
    start: {
      ...standingStart(85, 260, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      ...standingStart(85, 85, [{ t: 'barSide', at: 'grip' }]),
    },
  },
  'overhead-cable-rope-extension': {
    start: {
      root: [240, 124],
      torso: 75,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 75,
      farm: 255,
      equip: [{ t: 'cable', at: 'grip', anchor: [190, 130] }],
    },
    main: {
      root: [240, 124],
      torso: 75,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 75,
      farm: 75,
      equip: [{ t: 'cable', at: 'grip', anchor: [190, 130] }],
    },
  },
  'katana-extension': {
    start: {
      ...standingStart(80, 260, [{ t: 'cable', at: 'grip', anchor: [210, 40] }]),
    },
    main: {
      ...standingStart(310, 310, [{ t: 'cable', at: 'grip', anchor: [210, 40] }]),
    },
  },
  'jm-press': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260, inset: 40 }],
    },
    main: {
      view: 'end',
      arms: { L: [30, 140], R: [30, 140] },
      equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260, inset: 40 }],
    },
  },
  'tate-press': {
    start: {
      view: 'end',
      arms: { L: [75, 80], R: [75, 80] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
    main: {
      view: 'end',
      arms: { L: [0, 180], R: [0, 180] },
      equip: [...BENCH_END, { t: 'dumbbell', at: 'grips' }],
    },
  },
  'reverse-grip-cable-pushdown': {
    start: {
      ...standingStart(275, 60, [{ t: 'cable', at: 'grip', anchor: [240, 20] }]),
    },
    main: {
      ...standingStart(275, 275, [{ t: 'cable', at: 'grip', anchor: [240, 20] }]),
    },
  },

  // Legs, Glutes & Calves
  'goblet-squat': {
    start: {
      ...standingStart(260, 75, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [200, 175],
      torso: 65,
      thigh: 330,
      shin: 250,
      foot: 0,
      uarm: 260,
      farm: 75,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'front-squat': {
    start: {
      ...standingStart(10, 160, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      root: [205, 175],
      torso: 75,
      thigh: 335,
      shin: 250,
      foot: 0,
      uarm: 10,
      farm: 160,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'hack-squat': {
    start: {
      root: [220, 135],
      torso: 60,
      thigh: 240,
      shin: 240,
      foot: 330,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 200, y: 150, w: 20, h: 100 }],
    },
    main: {
      root: [190, 190],
      torso: 60,
      thigh: 330,
      shin: 230,
      foot: 330,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 170, y: 205, w: 20, h: 100 }],
    },
  },
  'zercher-squat': {
    start: {
      ...standingStart(280, 80, [{ t: 'barSide', at: 'grip' }]),
    },
    main: {
      root: [205, 175],
      torso: 70,
      thigh: 330,
      shin: 250,
      foot: 0,
      uarm: 280,
      farm: 80,
      equip: [{ t: 'barSide', at: 'grip' }],
    },
  },
  'box-squat': {
    start: {
      ...standingStart(250, 80, [{ t: 'barSide', at: 'grip' }, STEP_BOX[0]]),
    },
    main: {
      root: [200, 180],
      torso: 60,
      thigh: 345,
      shin: 260,
      foot: 0,
      uarm: 250,
      farm: 80,
      equip: [{ t: 'barSide', at: 'grip' }, STEP_BOX[0]],
    },
  },
  'sissy-squat': {
    start: {
      ...standingStart(270, 270),
    },
    main: {
      root: [240, 175],
      torso: 120,
      thigh: 20,
      shin: 210,
      foot: 290,
      uarm: 270,
      farm: 270,
    },
  },
  'stationary-lunge': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [240, 175],
      torso: 90,
      thigh: 335,
      shin: 260,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'dumbbell-walking-lunge': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [240, 175],
      torso: 90,
      thigh: 335,
      shin: 260,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'dumbbell-reverse-lunge': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [240, 175],
      torso: 90,
      thigh: 335,
      shin: 260,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'step-up': {
    start: {
      root: [220, 124],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }, STEP_BOX[0]],
    },
    main: {
      root: [260, 75],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }, STEP_BOX[0]],
    },
  },
  'single-leg-press': {
    start: {
      root: [210, 210],
      torso: 50,
      thigh: 340,
      shin: 250,
      foot: 330,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 260, y: 160, w: 20, h: 40 }],
    },
    main: {
      root: [210, 210],
      torso: 50,
      thigh: 30,
      shin: 300,
      foot: 330,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 285, y: 135, w: 20, h: 40 }],
    },
  },
  'lying-leg-curl': {
    start: {
      root: [240, 260],
      torso: 180,
      thigh: 0,
      shin: 0,
      foot: 270,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'box', x: 240, y: 275, w: 180, h: 14 }],
    },
    main: {
      root: [240, 260],
      torso: 180,
      thigh: 0,
      shin: 80,
      foot: 350,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'box', x: 240, y: 275, w: 180, h: 14 }],
    },
  },
  'nordic-hamstring-curl': {
    start: {
      root: [240, 220],
      torso: 90,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 270,
      farm: 270,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 220],
      torso: 35,
      thigh: 305,
      shin: 180,
      foot: 90,
      uarm: 270,
      farm: 270,
      equip: GROUND_MAT,
    },
  },
  'barbell-hip-thrust': {
    start: {
      root: [240, 240],
      torso: 40,
      thigh: 330,
      shin: 270,
      foot: 0,
      uarm: 310,
      farm: 310,
      equip: [{ t: 'box', x: 210, y: 220, w: 40, h: 76 }, { t: 'barSide', at: 'grip' }],
    },
    main: {
      root: [240, 200],
      torso: 0,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'box', x: 210, y: 220, w: 40, h: 76 }, { t: 'barSide', at: 'grip' }],
    },
  },
  'glute-bridge': {
    start: {
      root: [240, 280],
      torso: 0,
      thigh: 30,
      shin: 270,
      foot: 0,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 235],
      torso: 30,
      thigh: 30,
      shin: 270,
      foot: 0,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'dumbbell-romanian-deadlift': {
    start: {
      ...standingStart(270, 270, [{ t: 'dumbbell', at: 'grip' }]),
    },
    main: {
      root: [200, 130],
      torso: 40,
      thigh: 290,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'dumbbell', at: 'grip' }],
    },
  },
  'cable-pull-through': {
    start: {
      root: [200, 130],
      torso: 40,
      thigh: 290,
      shin: 270,
      foot: 0,
      uarm: 250,
      farm: 250,
      equip: [{ t: 'cable', at: 'grip', anchor: [160, 290] }],
    },
    main: {
      ...standingStart(270, 270, [{ t: 'cable', at: 'grip', anchor: [160, 290] }]),
    },
  },
  'cable-glute-kickback': {
    start: {
      root: [240, 140],
      torso: 70,
      thigh: 260,
      shin: 260,
      foot: 0,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'cable', at: 'grip', anchor: [240, 290] }],
    },
    main: {
      root: [240, 140],
      torso: 70,
      thigh: 210,
      shin: 210,
      foot: 300,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'cable', at: 'grip', anchor: [240, 290] }],
    },
  },
  'standing-single-leg-calf-raise': {
    start: {
      root: [240, 130],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 330,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'box', x: 245, y: 290, w: 40, h: 10 }],
    },
    main: {
      root: [240, 115],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 290,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'box', x: 245, y: 290, w: 40, h: 10 }],
    },
  },
  'tibialis-raise': {
    start: {
      root: [240, 130],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 0,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'post', x: 220, y: 70, h: 220 }],
    },
    main: {
      root: [240, 130],
      torso: 90,
      thigh: 270,
      shin: 270,
      foot: 40,
      uarm: 270,
      farm: 270,
      equip: [{ t: 'post', x: 220, y: 70, h: 220 }],
    },
  },
  'adductor-machine': {
    start: {
      ...seatedStart(270, 270, [{ t: 'box', x: 250, y: 215, w: 30, h: 10 }]),
    },
    main: {
      ...seatedStart(270, 270, [{ t: 'box', x: 235, y: 215, w: 30, h: 10 }]),
    },
  },
  'abductor-machine': {
    start: {
      ...seatedStart(270, 270, [{ t: 'box', x: 235, y: 215, w: 30, h: 10 }]),
    },
    main: {
      ...seatedStart(270, 270, [{ t: 'box', x: 250, y: 215, w: 30, h: 10 }]),
    },
  },

  // Core & Abs
  'plank': {
    start: {
      root: [290, 250],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 270,
      farm: 0,
      equip: GROUND_MAT,
    },
    main: {
      root: [290, 250],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 270,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'side-plank': {
    start: {
      root: [280, 250],
      torso: 155,
      thigh: 155,
      shin: 155,
      foot: 245,
      uarm: 270,
      farm: 0,
      equip: GROUND_MAT,
    },
    main: {
      root: [280, 250],
      torso: 155,
      thigh: 155,
      shin: 155,
      foot: 245,
      uarm: 270,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'bird-dog': {
    start: {
      root: [240, 220],
      torso: 180,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 270,
      farm: 270,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 220],
      torso: 180,
      thigh: 180,
      shin: 180,
      foot: 90,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'pallof-press': {
    start: {
      ...standingStart(240, 60, [{ t: 'cable', at: 'grip', anchor: [280, 80] }]),
    },
    main: {
      ...standingStart(10, 10, [{ t: 'cable', at: 'grip', anchor: [280, 80] }]),
    },
  },
  'high-to-low-woodchop': {
    start: {
      ...standingStart(50, 50, [{ t: 'cable', at: 'grip', anchor: [210, 30] }]),
    },
    main: {
      root: [240, 135],
      torso: 65,
      thigh: 280,
      shin: 250,
      foot: 0,
      uarm: 290,
      farm: 290,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 30] }],
    },
  },
  'low-to-high-woodchop': {
    start: {
      root: [240, 135],
      torso: 65,
      thigh: 280,
      shin: 250,
      foot: 0,
      uarm: 280,
      farm: 280,
      equip: [{ t: 'cable', at: 'grip', anchor: [210, 290] }],
    },
    main: {
      ...standingStart(45, 45, [{ t: 'cable', at: 'grip', anchor: [210, 290] }]),
    },
  },
  'russian-twist': {
    start: {
      root: [240, 240],
      torso: 45,
      thigh: 330,
      shin: 250,
      foot: 0,
      uarm: 20,
      farm: 20,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 240],
      torso: 45,
      thigh: 330,
      shin: 250,
      foot: 0,
      uarm: 310,
      farm: 310,
      equip: GROUND_MAT,
    },
  },
  'ab-wheel-rollout': {
    start: {
      root: [240, 220],
      torso: 140,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 280,
      farm: 280,
      equip: [{ t: 'box', x: 260, y: 285, w: 16, h: 16 }, GROUND_MAT[0]],
    },
    main: {
      root: [240, 240],
      torso: 170,
      thigh: 270,
      shin: 180,
      foot: 90,
      uarm: 20,
      farm: 20,
      equip: [{ t: 'box', x: 340, y: 285, w: 16, h: 16 }, GROUND_MAT[0]],
    },
  },
  'bicycle-crunch': {
    start: {
      root: [240, 260],
      torso: 10,
      thigh: 45,
      shin: 300,
      foot: 0,
      uarm: 20,
      farm: 140,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 260],
      torso: 25,
      thigh: 70,
      shin: 320,
      foot: 0,
      uarm: 45,
      farm: 160,
      equip: GROUND_MAT,
    },
  },
  'decline-crunch': {
    start: {
      root: [210, 210],
      torso: 330,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 30,
      farm: 150,
      equip: [{ t: 'box', x: 200, y: 230, w: 90, h: 14 }],
    },
    main: {
      root: [210, 210],
      torso: 15,
      thigh: 0,
      shin: 270,
      foot: 0,
      uarm: 30,
      farm: 150,
      equip: [{ t: 'box', x: 200, y: 230, w: 90, h: 14 }],
    },
  },
  'reverse-crunch': {
    start: {
      root: [240, 275],
      torso: 0,
      thigh: 90,
      shin: 0,
      foot: 270,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 260],
      torso: 20,
      thigh: 120,
      shin: 20,
      foot: 270,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'lying-leg-raise': {
    start: {
      root: [240, 275],
      torso: 0,
      thigh: 15,
      shin: 15,
      foot: 285,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 275],
      torso: 0,
      thigh: 90,
      shin: 90,
      foot: 0,
      uarm: 0,
      farm: 0,
      equip: GROUND_MAT,
    },
  },
  'mountain-climber': {
    start: {
      root: [300, 230],
      torso: 165,
      thigh: 165,
      shin: 165,
      foot: 255,
      uarm: 265,
      farm: 265,
      equip: GROUND_MAT,
    },
    main: {
      root: [300, 230],
      torso: 165,
      thigh: 110,
      shin: 330,
      foot: 255,
      uarm: 265,
      farm: 265,
      equip: GROUND_MAT,
    },
  },
  'dead-bug': {
    start: {
      root: [240, 275],
      torso: 0,
      thigh: 90,
      shin: 0,
      foot: 270,
      uarm: 90,
      farm: 90,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 275],
      torso: 0,
      thigh: 15,
      shin: 15,
      foot: 285,
      uarm: 170,
      farm: 170,
      equip: GROUND_MAT,
    },
  },
  'hanging-windshield-wipers': {
    start: {
      root: [240, 160],
      torso: 90,
      thigh: 90,
      shin: 90,
      foot: 0,
      uarm: 90,
      farm: 90,
      equip: RIG,
    },
    main: {
      root: [240, 160],
      torso: 90,
      thigh: 45,
      shin: 45,
      foot: 315,
      uarm: 90,
      farm: 90,
      equip: RIG,
    },
  },
  'dragon-flag': {
    start: {
      root: [240, 240],
      torso: 0,
      thigh: 0,
      shin: 0,
      foot: 270,
      uarm: 140,
      farm: 140,
      equip: [{ t: 'box', x: 240, y: 250, w: 160, h: 14 }],
    },
    main: {
      root: [220, 220],
      torso: 40,
      thigh: 40,
      shin: 40,
      foot: 310,
      uarm: 140,
      farm: 140,
      equip: [{ t: 'box', x: 240, y: 250, w: 160, h: 14 }],
    },
  },
  'v-up': {
    start: {
      root: [240, 280],
      torso: 0,
      thigh: 0,
      shin: 0,
      foot: 270,
      uarm: 180,
      farm: 180,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 260],
      torso: 45,
      thigh: 45,
      shin: 45,
      foot: 315,
      uarm: 45,
      farm: 45,
      equip: GROUND_MAT,
    },
  },
  'hollow-body-rock': {
    start: {
      root: [240, 285],
      torso: 20,
      thigh: 340,
      shin: 340,
      foot: 270,
      uarm: 160,
      farm: 160,
      equip: GROUND_MAT,
    },
    main: {
      root: [240, 285],
      torso: 35,
      thigh: 355,
      shin: 355,
      foot: 270,
      uarm: 175,
      farm: 175,
      equip: GROUND_MAT,
    },
  },
};

let count = 0;
for (const [id, states] of Object.entries(LYFTA_POSES)) {
  for (const [state, pose] of Object.entries(states)) {
    const file = join(outDir, `${id}-${state}.svg`);
    writeFileSync(file, renderPose(pose, { label: `${id} (${state})` }));
    count++;
  }
}

console.log(`Rendered ${count} new SVG figures into ${outDir}`);
