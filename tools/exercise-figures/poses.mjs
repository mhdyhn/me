/**
 * Pose data for the exercise illustrations (pilot set: 5 exercises, 2 states each).
 *
 *   start - where the set begins
 *   main  - the working position (bottom of a squat, top of a curl, etc.)
 *
 * Angles follow render.mjs. Side view: 0 = right, 90 = up. End view: 0 = out, 90 = up.
 * Equipment `at: 'grip'` is placed at the hands, so the bar follows the arms.
 */

// ---- Bench press: end view (camera at the head). Elbows flare out, so this view is needed. ----
const BENCH_END = [{ t: 'benchEnd', x: 240, y: 206 }];
const bench = {
  start: {
    view: 'end',
    arms: { L: [70, 75], R: [70, 75] },
    equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260 }],
  },
  main: {
    view: 'end',
    arms: { L: [-40, 85], R: [-40, 85] },
    equip: [...BENCH_END, { t: 'bar', at: 'grip', len: 260 }],
  },
};

// ---- Back squat: side view. Bar sits on the upper back. ----
const squat = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 250,
    farm: 80,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [200, 173],
    torso: 60,
    thigh: 330,
    shin: 250,
    foot: 0,
    uarm: 250,
    farm: 80,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

// ---- Romanian deadlift: side view. Hips go back, knees stay almost straight. ----
const rdl = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 280,
    farm: 275,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [200, 129],
    torso: 40,
    thigh: 290,
    shin: 270,
    foot: 0,
    uarm: 272,
    farm: 268,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

// ---- Lat pulldown: side view, seated. Cable runs from the top anchor to the hands. ----
const SEAT = [
  { t: 'box', x: 168, y: 218, w: 64, h: 14 },
  { t: 'post', x: 164, y: 40, h: 180 },
];
const PULLEY = { t: 'cable', at: 'grip', anchor: [200, -90] };
const pulldownBase = {
  root: [200, 212],
  torso: 95,
  thigh: 0,
  shin: 270,
  foot: 0,
};
const pulldown = {
  start: {
    ...pulldownBase,
    uarm: 88,
    farm: 92,
    equip: [...SEAT, { ...PULLEY }, { t: 'barSide', at: 'grip' }],
  },
  main: {
    ...pulldownBase,
    uarm: 255,
    farm: 35,
    equip: [...SEAT, { ...PULLEY }, { t: 'barSide', at: 'grip' }],
  },
};

// ---- Barbell curl: side view, standing. ----
const curl = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 280,
    farm: 276,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 280,
    farm: 80,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

export const POSES = {
  'barbell-bench-press': bench,
  'barbell-squat': squat,
  'romanian-deadlift': rdl,
  'lat-pulldown': pulldown,
  'barbell-curl': curl,
};
