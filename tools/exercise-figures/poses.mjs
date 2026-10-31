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

const singleArmLatPulldown = {
  start: {
    ...pulldownBase,
    uarm: 85,
    farm: 90,
    equip: [...SEAT, { ...PULLEY }, { t: 'barSide', at: 'grip' }],
  },
  main: {
    ...pulldownBase,
    uarm: 255,
    farm: 35,
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

const smithSquat = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 250,
    farm: 80,
    equip: [{ t: 'post', x: 235, y: 30, h: 260 }, { t: 'barSide', at: 'grip' }],
  },
  main: {
    root: [200, 173],
    torso: 60,
    thigh: 330,
    shin: 250,
    foot: 0,
    uarm: 250,
    farm: 80,
    equip: [{ t: 'post', x: 235, y: 30, h: 260 }, { t: 'barSide', at: 'grip' }],
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

const cableExternalRotation = {
  start: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 0,
    equip: [{ t: 'post', x: 120, y: 50, h: 240 }, { t: 'cable', at: 'grip', anchor: [120, 190] }],
  },
  main: {
    root: [240, 124],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 70,
    equip: [{ t: 'post', x: 120, y: 50, h: 240 }, { t: 'cable', at: 'grip', anchor: [120, 190] }],
  },
};

const machinePreacherCurl = {
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
};

// ---- The remaining catalogue moves. Same skeleton, same scale, same palette. ----

// A standing figure and a seated figure, the two base poses of the catalogue.
const STAND = { root: [240, 124], torso: 90, thigh: 270, shin: 270, foot: 0 };
const SEATED = { root: [200, 212], torso: 90, thigh: 0, shin: 270, foot: 0 };

// ---- Incline dumbbell press: the figure lies back on a tilted bench, feet toward the low end. ----
const inclineDumbbellPressBase = {
  root: [150, 200],
  torso: 30,
  thigh: 210,
  shin: 205,
  foot: 195,
  equip: [
    { t: 'benchTilt', x: 215, y: 165, w: 150, angle: -30 },
    { t: 'post', x: 145, y: 200, h: 96 },
    { t: 'dumbbell', at: 'grip' },
  ],
};
const inclineDumbbellPress = {
  start: { ...inclineDumbbellPressBase, uarm: 240, farm: 34 },
  main: { ...inclineDumbbellPressBase, uarm: 75, farm: 75 },
};

// ---- Incline barbell press: the same bench, a bar instead of two dumbbells. ----
const inclineBarbellPressBase = {
  ...inclineDumbbellPressBase,
  equip: [
    { t: 'benchTilt', x: 215, y: 165, w: 150, angle: -30 },
    { t: 'post', x: 145, y: 200, h: 96 },
    { t: 'barSide', at: 'grip' },
  ],
};
const inclineBarbellPress = {
  start: { ...inclineBarbellPressBase, uarm: 240, farm: 34 },
  main: { ...inclineBarbellPressBase, uarm: 75, farm: 75 },
};

// ---- Decline dumbbell press: the head end of the bench is the low end. ----
const declineDumbbellPressBase = {
  root: [150, 130],
  torso: 330,
  thigh: 240,
  shin: 265,
  foot: 0,
  equip: [
    { t: 'benchTilt', x: 215, y: 165, w: 150, angle: 30 },
    { t: 'post', x: 272, y: 202, h: 94 },
    { t: 'dumbbell', at: 'grip' },
  ],
};
const declineDumbbellPress = {
  start: { ...declineDumbbellPressBase, uarm: 254, farm: 45 },
  main: { ...declineDumbbellPressBase, uarm: 85, farm: 85 },
};

// ---- Flat dumbbell press: the body lies on a flat bench. ----
const flatDumbbellPress = {
  start: {
    root: [150, 195],
    torso: 0,
    thigh: 180,
    shin: 180,
    foot: 250,
    uarm: 251,
    farm: 52,
    equip: [{ t: 'bench', x: 215, y: 205, w: 150 }, { t: 'dumbbell', at: 'grip' }],
  },
  main: {
    root: [150, 195],
    torso: 0,
    thigh: 180,
    shin: 180,
    foot: 250,
    uarm: 85,
    farm: 85,
    equip: [{ t: 'bench', x: 215, y: 205, w: 150 }, { t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Machine chest press: seated, the handles travel forward. ----
const machineChestPress = {
  start: {
    ...SEATED,
    torso: 95,
    uarm: 245,
    farm: 39,
    equip: [...SEATED_BENCH, { t: 'post', x: 330, y: 70, h: 226 }, { t: 'handle', at: 'grip' }],
  },
  main: {
    ...SEATED,
    torso: 95,
    uarm: 5,
    farm: 5,
    equip: [...SEATED_BENCH, { t: 'post', x: 330, y: 70, h: 226 }, { t: 'handle', at: 'grip' }],
  },
};

// ---- Chest supported machine row: the torso leans on the pad, the handle comes back. ----
const machineRow = {
  start: {
    root: [175, 210],
    torso: 55,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 340,
    farm: 340,
    equip: [
      { t: 'bench', x: 175, y: 225, w: 100 },
      { t: 'box', x: 236, y: 116, w: 32, h: 14 },
      { t: 'handle', at: 'grip' },
    ],
  },
  main: {
    root: [175, 210],
    torso: 55,
    thigh: 0,
    shin: 270,
    foot: 0,
    uarm: 225,
    farm: 346,
    equip: [
      { t: 'bench', x: 175, y: 225, w: 100 },
      { t: 'box', x: 236, y: 116, w: 32, h: 14 },
      { t: 'handle', at: 'grip' },
    ],
  },
};

// ---- Seated cable row: the cable comes from a low anchor in front. ----
const seatedCableRow = {
  start: {
    ...SEATED,
    torso: 85,
    uarm: 0,
    farm: 0,
    equip: [...SEATED_BENCH, { t: 'cable', at: 'grip', anchor: [330, 285] }],
  },
  main: {
    ...SEATED,
    torso: 85,
    uarm: 232,
    farm: 2,
    equip: [...SEATED_BENCH, { t: 'cable', at: 'grip', anchor: [330, 285] }],
  },
};

// ---- One arm dumbbell row: the other hand rests on a bench. ----
const oneArmDumbbellRow = {
  start: {
    root: [225, 140],
    torso: 25,
    thigh: 280,
    shin: 305,
    foot: 0,
    uarm: 270,
    farm: 270,
    far: { uarm: 250, farm: 270 },
    equip: [{ t: 'bench', x: 288, y: 211, w: 80 }, { t: 'dumbbell', at: 'grip' }],
  },
  main: {
    root: [225, 140],
    torso: 25,
    thigh: 280,
    shin: 305,
    foot: 0,
    uarm: 135,
    farm: 250,
    far: { uarm: 250, farm: 270 },
    equip: [{ t: 'bench', x: 288, y: 211, w: 80 }, { t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Cable face pull: the rope comes to the face. ----
const facePull = {
  start: {
    ...STAND,
    torso: 100,
    uarm: 0,
    farm: 0,
    equip: [{ t: 'cable', at: 'grip', anchor: [345, 45] }],
  },
  main: {
    ...STAND,
    torso: 100,
    uarm: 345,
    farm: 150,
    equip: [{ t: 'cable', at: 'grip', anchor: [345, 45] }],
  },
};

// ---- Cable fly: end view, the hands start wide and low and meet in front. ----
const cableFly = {
  start: {
    view: 'end',
    arms: { L: [250, 250], R: [290, 290] },
    equip: [{ t: 'cable', at: 'grips', anchor: [240, 300] }],
  },
  main: {
    view: 'end',
    arms: { L: [115, 115], R: [115, 115] },
    equip: [{ t: 'cable', at: 'grips', anchor: [240, 300] }],
  },
};

// ---- Lateral raise: end view, the arms lift out to the sides. ----
const lateralRaise = {
  start: {
    view: 'end',
    arms: { L: [265, 265], R: [275, 275] },
    equip: [{ t: 'dumbbell', at: 'grips' }],
  },
  main: {
    view: 'end',
    arms: { L: [85, 85], R: [85, 85] },
    equip: [{ t: 'dumbbell', at: 'grips' }],
  },
};

// ---- Single arm cable lateral raise: the same shape, one cable. ----
const cableLateralRaise = {
  start: {
    view: 'end',
    arms: { L: [265, 265], R: [275, 275] },
    equip: [{ t: 'cable', at: 'grips', anchor: [240, 300] }],
  },
  main: {
    view: 'end',
    arms: { L: [85, 85], R: [85, 85] },
    equip: [{ t: 'cable', at: 'grips', anchor: [240, 300] }],
  },
};

// ---- Seated dumbbell shoulder press. ----
const shoulderPress = {
  start: {
    ...SEATED,
    uarm: 299,
    farm: 99,
    equip: [...SEATED_BENCH, { t: 'dumbbell', at: 'grip' }],
  },
  main: {
    ...SEATED,
    uarm: 78,
    farm: 78,
    equip: [...SEATED_BENCH, { t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Cable shoulder press: seated, the cable runs from a low anchor. ----
const cableShoulderPress = {
  start: {
    ...SEATED,
    uarm: 299,
    farm: 99,
    equip: [...SEATED_BENCH, { t: 'cable', at: 'grip', anchor: [330, 292] }],
  },
  main: {
    ...SEATED,
    uarm: 78,
    farm: 78,
    equip: [...SEATED_BENCH, { t: 'cable', at: 'grip', anchor: [330, 292] }],
  },
};

// ---- Standing barbell press: the bar starts on the shoulders and ends overhead. ----
const standingBarbellPress = {
  start: {
    ...STAND,
    torso: 92,
    uarm: 285,
    farm: 94,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
  main: {
    ...STAND,
    torso: 92,
    uarm: 88,
    farm: 88,
    equip: [{ t: 'barSide', at: 'grip' }],
  },
};

// ---- Cable triceps pushdown: the arms straighten down in front. ----
const cableTricepsPushdown = {
  start: {
    ...STAND,
    uarm: 325,
    farm: 325,
    equip: [{ t: 'cable', at: 'grip', anchor: [330, 20] }],
  },
  main: {
    ...STAND,
    uarm: 334,
    farm: 219,
    equip: [{ t: 'cable', at: 'grip', anchor: [330, 20] }],
  },
};

// ---- Rope triceps pushdown: the rope hangs from both hands, the elbows stay close. ----
const ropeTricepsPushdown = {
  start: {
    ...STAND,
    uarm: 315,
    farm: 315,
    equip: [{ t: 'cable', at: 'grip', anchor: [300, 12] }],
  },
  main: {
    ...STAND,
    uarm: 321,
    farm: 243,
    equip: [{ t: 'cable', at: 'grip', anchor: [300, 12] }],
  },
};

// ---- Overhead cable triceps extension: the rope starts behind the head. ----
const overheadCableTricepsExtension = {
  start: {
    ...STAND,
    uarm: 88,
    farm: 248,
    equip: [{ t: 'cable', at: 'grip', anchor: [240, -120] }],
  },
  main: {
    ...STAND,
    uarm: 88,
    farm: 88,
    equip: [{ t: 'cable', at: 'grip', anchor: [240, -120] }],
  },
};

// ---- Single arm cable triceps extension: one arm works, the other stays down. ----
const cableTricepsSingleArm = {
  start: {
    ...STAND,
    uarm: 88,
    farm: 248,
    far: { uarm: 270, farm: 270 },
    equip: [{ t: 'cable', at: 'grip', anchor: [300, -120] }],
  },
  main: {
    ...STAND,
    uarm: 88,
    farm: 88,
    far: { uarm: 270, farm: 270 },
    equip: [{ t: 'cable', at: 'grip', anchor: [300, -120] }],
  },
};

// ---- Incline dumbbell curl: the back rests on a steep bench, the elbows stay low. ----
const inclineDumbbellCurl = {
  start: {
    ...STAND,
    torso: 100,
    uarm: 280,
    farm: 270,
    equip: [{ t: 'benchTilt', x: 250, y: 180, w: 130, angle: -70 }, { t: 'dumbbell', at: 'grip' }],
  },
  main: {
    ...STAND,
    torso: 100,
    uarm: 237,
    farm: 9,
    equip: [{ t: 'benchTilt', x: 250, y: 180, w: 130, angle: -70 }, { t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Cable curl: the cable comes from below. ----
const cableCurl = {
  start: {
    ...STAND,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'cable', at: 'grip', anchor: [300, 296] }],
  },
  main: {
    ...STAND,
    uarm: 258,
    farm: 47,
    equip: [{ t: 'cable', at: 'grip', anchor: [300, 296] }],
  },
};

// ---- Dumbbell hammer curl: same line as the cable curl, a dumbbell in the hand. ----
const hammerCurl = {
  start: {
    ...STAND,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
  main: {
    ...STAND,
    uarm: 258,
    farm: 47,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Dumbbell biceps curl. ----
const dumbbellBicepsCurl = {
  start: {
    ...STAND,
    uarm: 270,
    farm: 270,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
  main: {
    ...STAND,
    uarm: 259,
    farm: 47,
    equip: [{ t: 'dumbbell', at: 'grip' }],
  },
};

// ---- Bodyweight squat: no bar, the arms reach forward for balance. ----
const bodyweightSquat = {
  start: {
    ...STAND,
    uarm: 250,
    farm: 80,
    equip: [],
  },
  main: {
    root: [200, 173],
    torso: 60,
    thigh: 330,
    shin: 250,
    foot: 0,
    uarm: 250,
    farm: 80,
    equip: [],
  },
};

// ---- Neutral grip lat pulldown: the same machine as the wide grip pulldown. ----
const neutralGripLatPulldown = {
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

// ---- Leg press: the back is against the pad, the feet push the platform away. ----
const legPress = {
  start: {
    root: [170, 200],
    torso: 90,
    thigh: 0,
    shin: 250,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [
      { t: 'bench', x: 180, y: 200, w: 90 },
      { t: 'post', x: 140, y: 90, h: 110 },
      { t: 'box', x: 366, y: 150, w: 16, h: 120 },
    ],
  },
  main: {
    root: [170, 200],
    torso: 90,
    thigh: 0,
    shin: 0,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [
      { t: 'bench', x: 180, y: 200, w: 90 },
      { t: 'post', x: 140, y: 90, h: 110 },
      { t: 'box', x: 366, y: 150, w: 16, h: 120 },
    ],
  },
};

// ---- Leg extension: seated, the knee straightens. ----
const legExtension = {
  start: {
    ...SEATED,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'post', x: 350, y: 110, h: 186 }],
  },
  main: {
    ...SEATED,
    thigh: 0,
    shin: 0,
    foot: 0,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'post', x: 350, y: 110, h: 186 }],
  },
};

// ---- Seated leg curl: the heel comes toward the butt. ----
const legCurl = {
  start: {
    ...SEATED,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'box', x: 250, y: 268, w: 34, h: 12 }],
  },
  main: {
    ...SEATED,
    thigh: 0,
    shin: 210,
    foot: 180,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'box', x: 250, y: 268, w: 34, h: 12 }],
  },
};

// ---- Standing calf raise: the heels come up. ----
const standingCalfRaise = {
  start: {
    ...STAND,
    uarm: 270,
    farm: 270,
    equip: [],
  },
  main: {
    root: [240, 110],
    torso: 90,
    thigh: 270,
    shin: 270,
    foot: 330,
    uarm: 270,
    farm: 270,
    equip: [],
  },
};

// ---- Seated calf raise: the heels come up on the platform. ----
const seatedCalfRaise = {
  start: {
    ...SEATED,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'box', x: 275, y: 288, w: 70, h: 10 }],
  },
  main: {
    root: [200, 198],
    torso: 90,
    thigh: 0,
    shin: 270,
    foot: 330,
    uarm: 270,
    farm: 270,
    equip: [...SEATED_BENCH, { t: 'box', x: 275, y: 288, w: 70, h: 10 }],
  },
};

// ---- Kneeling cable crunch: the rope comes from above, the torso folds down. ----
const cableCrunch = {
  start: {
    root: [190, 200],
    torso: 90,
    thigh: 0,
    shin: 180,
    foot: 180,
    uarm: 348,
    farm: 139,
    equip: [{ t: 'cable', at: 'grip', anchor: [240, -60] }],
  },
  main: {
    root: [190, 200],
    torso: 60,
    thigh: 0,
    shin: 180,
    foot: 180,
    uarm: 8,
    farm: 148,
    equip: [{ t: 'cable', at: 'grip', anchor: [240, -60] }],
  },
};

// ---- Bulgarian split squat: the back foot rests on a box, the front foot on the floor. ----
const bulgarianSplitSquat = {
  start: {
    root: [215, 152],
    torso: 90,
    thigh: 320,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    far: { thigh: 235, shin: 241, foot: 200 },
    equip: [{ t: 'box', x: 90, y: 285, w: 55, h: 11 }],
  },
  main: {
    root: [215, 195],
    torso: 88,
    thigh: 348,
    shin: 270,
    foot: 0,
    uarm: 270,
    farm: 270,
    far: { thigh: 250, shin: 190, foot: 200 },
    equip: [{ t: 'box', x: 90, y: 285, w: 55, h: 11 }],
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
  'single-arm-lat-pulldown': singleArmLatPulldown,
  'barbell-bent-over-row': bentOverRow,
  'sumo-deadlift': sumoDeadlift,
  'ez-bar-curl': ezBarCurl,
  'dead-hang': deadHang,
  'single-leg-cable-rdl': singleLegCableRdl,
  'machine-crunch': machineCrunch,
  'hollow-hold': hollowHold,
  'swedish-dip': swedishDip,
  'smith-shoulder-press': smithShoulderPress,
  'smith-squat': smithSquat,
  'machine-lateral-raise': machineLateralRaise,
  'two-hand-dumbbell-overhead-triceps': twoHandDumbbellOverheadTriceps,
  'machine-triceps-extension': machineTricepsExtension,
  'parallel-grip-pull-up': parallelGripPullUp,
  'close-grip-cable-row': closeGripCableRow,
  'close-grip-barbell-curl': closeGripBarbellCurl,
  'crossbody-hammer-curl': crossbodyHammerCurl,
  'cable-external-rotation': cableExternalRotation,
  'machine-preacher-curl': machinePreacherCurl,

  'incline-dumbbell-press': inclineDumbbellPress,
  'shoulder-press': shoulderPress,
  'cable-fly': cableFly,
  'lateral-raise': lateralRaise,
  'cable-lateral-raise': cableLateralRaise,
  'cable-triceps-pushdown': cableTricepsPushdown,
  'overhead-cable-triceps-extension': overheadCableTricepsExtension,
  'neutral-grip-lat-pulldown': neutralGripLatPulldown,
  'seated-cable-row': seatedCableRow,
  'one-arm-dumbbell-row': oneArmDumbbellRow,
  'face-pull': facePull,
  'incline-dumbbell-curl': inclineDumbbellCurl,
  'cable-curl': cableCurl,
  'hammer-curl': hammerCurl,
  'dumbbell-biceps-curl': dumbbellBicepsCurl,
  'leg-press': legPress,
  'leg-extension': legExtension,
  'leg-curl': legCurl,
  'standing-calf-raise': standingCalfRaise,
  'seated-calf-raise': seatedCalfRaise,
  'cable-crunch': cableCrunch,
  'incline-barbell-press': inclineBarbellPress,
  'machine-chest-press': machineChestPress,
  'machine-row': machineRow,
  'rope-triceps-pushdown': ropeTricepsPushdown,
  'bulgarian-split-squat': bulgarianSplitSquat,
  'flat-dumbbell-press': flatDumbbellPress,
  'decline-dumbbell-press': declineDumbbellPress,
  'cable-shoulder-press': cableShoulderPress,
  'standing-barbell-press': standingBarbellPress,
  'cable-triceps-single-arm': cableTricepsSingleArm,
  'bodyweight-squat': bodyweightSquat,
};
