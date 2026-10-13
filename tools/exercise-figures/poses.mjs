/**
 * Pose data for the exercise illustrations.
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

// Pull-up / hanging rig equipment
const RIG = [
  { t: 'pullbar', x: 240, y: 30, len: 120 },
  { t: 'post', x: 180, y: 30, h: 260 },
  { t: 'post', x: 300, y: 30, h: 260 },
];

const deadHang = {
  start: {
    root: [240, 155],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: RIG,
  },
  main: {
    root: [240, 150],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: RIG,
  },
};

const hangingLegRaise = {
  start: {
    root: [240, 155],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: RIG,
  },
  main: {
    root: [240, 155],
    torso: 85,
    thigh: 0,
    shin: 0,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: RIG,
  },
};

const parallelGripPullUp = {
  start: {
    root: [240, 155],
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
    uarm: 260,
    farm: 85,
    equip: RIG,
  },
};

const swedishDip = {
  start: {
    root: [240, 150],
    torso: 85,
    thigh: 270,
    shin: 250,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'pullbar', x: 240, y: 160, len: 100 }, { t: 'post', x: 240, y: 160, h: 130 }],
  },
  main: {
    root: [240, 195],
    torso: 75,
    thigh: 270,
    shin: 250,
    foot: 0,
    uarm: 220,
    farm: 310,
    equip: [{ t: 'pullbar', x: 240, y: 160, len: 100 }, { t: 'post', x: 240, y: 160, h: 130 }],
  },
};

const bentOverRow = {
  start: {
    root: [220, 130],
    torso: 40,
    thigh: 285,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [220, 130],
    torso: 40,
    thigh: 285,
    shin: 270,
    foot: 0,
    uarm: 210,
    farm: 30,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

const sumoDeadlift = {
  start: {
    root: [220, 165],
    torso: 65,
    thigh: 330,
    shin: 260,
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
    uarm: 275,
    farm: 275,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

const ezBarCurl = {
  start: curl.start,
  main: curl.main,
};

const closeGripBarbellCurl = {
  start: curl.start,
  main: curl.main,
};

const crossbodyHammerCurl = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 275,
    farm: 275,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
  main: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 310,
    farm: 85,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
};

const singleLegCableRdl = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'cable', at: 'grip', anchor: [280, 280] }],
  },
  main: {
    root: [220, 130],
    torso: 35,
    thigh: 280,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'cable', at: 'grip', anchor: [280, 280] }],
  },
};

const reverseGripLatPulldown = {
  start: pulldown.start,
  main: {
    ...pulldownBase,
    uarm: 260,
    farm: 45,
    equip: [...SEAT, { ...PULLEY }, { t: 'barSide', at: 'grip' }],
  },
};

const closeGripCableRow = {
  start: {
    root: [190, 215],
    torso: 80,
    thigh: 10,
    shin: 280,
    foot: 0,
    uarm: 355,
    farm: 0,
    equip: [
      { t: 'bench', x: 220, y: 225, w: 120 },
      { t: 'box', x: 290, y: 200, w: 14, h: 40 },
      { t: 'cable', at: 'grip', anchor: [300, 220] },
    ],
  },
  main: {
    root: [190, 215],
    torso: 95,
    thigh: 10,
    shin: 280,
    foot: 0,
    uarm: 230,
    farm: 30,
    equip: [
      { t: 'bench', x: 220, y: 225, w: 120 },
      { t: 'box', x: 290, y: 200, w: 14, h: 40 },
      { t: 'cable', at: 'grip', anchor: [300, 220] },
    ],
  },
};

const SEATED_BENCH = [
  { t: 'bench', x: 220, y: 225, w: 100 },
  { t: 'post', x: 195, y: 120, h: 105 },
];

const twoHandDumbbellOverheadTriceps = {
  start: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'dumbbell', at: 'grip' }],
  },
  main: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: [...SEATED_BENCH, { t: 'dumbbell', at: 'grip' }],
  },
};

const smithShoulderPress = {
  start: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 70,
    equip: [...SEATED_BENCH, { t: 'post', x: 235, y: 40, h: 250 }, { t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 90,
    farm: 90,
    equip: [...SEATED_BENCH, { t: 'post', x: 235, y: 40, h: 250 }, { t: 'barSide', at: 'grip' }],
  },
};

const machineCrunch = {
  start: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 70,
    equip: SEATED_BENCH,
  },
  main: {
    root: [210, 215],
    torso: 50,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 250,
    farm: 60,
    equip: SEATED_BENCH,
  },
};

const machineTricepsExtension = {
  start: {
    root: [210, 215],
    torso: 85,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 330,
    farm: 75,
    equip: SEATED_BENCH,
  },
  main: {
    root: [210, 215],
    torso: 85,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 310,
    farm: 310,
    equip: SEATED_BENCH,
  },
};

const machineLateralRaise = {
  start: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: SEATED_BENCH,
  },
  main: {
    root: [210, 215],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 0,
    farm: 0,
    equip: SEATED_BENCH,
  },
};

const reverseFly = {
  start: {
    root: [210, 215],
    torso: 90,
    thigh: 180,
    shin: 270,
    foot: 180,
    uarm: 0,
    farm: 0,
    equip: SEATED_BENCH,
  },
  main: {
    root: [210, 215],
    torso: 90,
    thigh: 180,
    shin: 270,
    foot: 180,
    uarm: 180,
    farm: 180,
    equip: SEATED_BENCH,
  },
};

const hollowHold = {
  start: {
    root: [240, 290],
    torso: 0,
    thigh: 0,
    shin: 0,
    foot: 270,
    uarm: 180,
    farm: 180,
    equip: [{ t: 'box', x: 240, y: 294, w: 220, h: 4 }],
  },
  main: {
    root: [240, 285],
    torso: 20,
    thigh: 340,
    shin: 340,
    foot: 270,
    uarm: 160,
    farm: 160,
    equip: [{ t: 'box', x: 240, y: 294, w: 220, h: 4 }],
  },
};

export const POSES = {
  'barbell-bench-press': bench,
  'barbell-squat': squat,
  'romanian-deadlift': rdl,
  'lat-pulldown': pulldown,
  'barbell-curl': curl,
  'reverse-fly': reverseFly,
  'hanging-leg-raise': hangingLegRaise,
  'reverse-grip-lat-pulldown': reverseGripLatPulldown,
  'barbell-bent-over-row': bentOverRow,
  'sumo-deadlift': sumoDeadlift,
  'ez-bar-curl': ezBarCurl,
  'dead-hang': deadHang,
  'single-leg-cable-rdl': singleLegCableRdl,
  'machine-crunch': machineCrunch,
  'hollow-hold': hollowHold,
  'swedish-dip': swedishDip,
  'smith-shoulder-press': smithShoulderPress,
  'machine-lateral-raise': machineLateralRaise,
  'two-hand-dumbbell-overhead-triceps': twoHandDumbbellOverheadTriceps,
  'machine-triceps-extension': machineTricepsExtension,
  'parallel-grip-pull-up': parallelGripPullUp,
  'close-grip-cable-row': closeGripCableRow,
  'close-grip-barbell-curl': closeGripBarbellCurl,
  'crossbody-hammer-curl': crossbodyHammerCurl,
};
