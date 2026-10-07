import { armPoses } from './armPoses';
import {
  STAND_FEET,
  backBar,
  barbell,
  benchFixture,
  buildPose,
  cable,
  createMotion,
  dumbbellLeft,
  dumbbells,
  loop,
  type PoseInputs,
} from './authoring';
import type {
  JointRotation,
  MotionDefinition,
  MotionEquipment,
  MotionFixture,
  MotionKey,
  MotionStandard,
  PlantBone,
} from './types';

/**
 * Movement catalogue, drawn on the shipped CC0 rig.
 *
 * Every loop runs 0 → 1 through five keys whose `phase` matches the written
 * steps of the exercise:
 *   phase 0  start position        phase 3  second execution step
 *   phase 1  first execution step  phase 4  back to the start
 *   phase 2  turning point of the movement
 *
 * Arm angles come from `tools/arm-solve.ts`. Each family is one shoulder
 * orientation fitted to an elbow target and a palm target on the rig, and the
 * elbow angle then sweeps the hand along the arc that family prints. So a curl
 * really curls, a press really presses, and the elbow keeps bending in the plane
 * a real elbow bends in.
 */

/** Shoulder channels of a solved family, at a chosen elbow angle. */
const at = (family: keyof typeof armPoses, hinge: number): { upperarm: JointRotation; lowerarm: JointRotation } => {
  const solved = armPoses[family];
  return { upperarm: { ...solved.upperarm }, lowerarm: { hinge } };
};

/** Both arms in one family, at one elbow angle. */
const both = (family: keyof typeof armPoses, hinge: number): PoseInputs['arms'] => at(family, hinge);

/** One arm of a hold, mirrored to the other side by `buildPose`. */
const one = (family: keyof typeof armPoses, hinge: number): PoseInputs['arms'] => ({
  upperarm: { ...armPoses[family].upperarm },
  lowerarm: { hinge },
});

interface KeySpec {
  phase: number;
  label: string;
  inputs: PoseInputs;
  /** Root offset in metres, for lifts that move the body a long way. */
  root?: [number, number, number];
}

const key = ({ phase, label, inputs, root }: KeySpec): MotionKey => ({
  t: 0,
  phase,
  label,
  pose: buildPose(inputs),
  root,
});

interface MotionSpec {
  id: string;
  name: string;
  summary: string;
  seconds: number;
  plantBones?: PlantBone[];
  equipment?: MotionEquipment[];
  fixtures?: MotionFixture[];
  standards: MotionStandard[];
  keys: KeySpec[];
}

const motion = (spec: MotionSpec): MotionDefinition =>
  createMotion({
    id: spec.id,
    name: spec.name,
    summary: spec.summary,
    durationSeconds: spec.seconds,
    plantBones: spec.plantBones ?? STAND_FEET,
    equipment: spec.equipment ?? [],
    fixtures: spec.fixtures,
    standards: spec.standards,
    keys: loop(...(spec.keys.map(key) as [MotionKey, MotionKey, MotionKey, MotionKey])),
  });

/* --------------------------------------------------------------- standards */

const squatStandards: MotionStandard[] = [
  { label: 'کف پا روی زمین', detail: 'وزن روی تمام کف پا پخش می‌شود و پاشنه بلند نمی‌شود.' },
  { label: 'زانو هم‌جهت پنجه', detail: 'زانو به داخل نمی‌افتد و از خط پنجه بیرون نمی‌زند.' },
  { label: 'لگن و زانو هم‌زمان', detail: 'خم‌شدن از لگن و زانو با هم آغاز می‌شود، نه یکی پس از دیگری.' },
  { label: 'تنهٔ ثابت', detail: 'کمر بدون گردشدن و بدون گودشدن زیاد می‌ماند.' },
  { label: 'عمق کنترل‌شده', detail: 'پایین‌رفتن تا عمقی که تعادل و سفتی تنه حفظ می‌شود.' },
];

const pressStandards: MotionStandard[] = [
  { label: 'کتف جمع و ثابت', detail: 'کتف‌ها زیر بدن جمع می‌مانند و به جلو نمی‌چرخند.' },
  { label: 'ساعد عمودی', detail: 'در پایین‌ترین نقطه ساعدها نزدیک به عمودی هستند.' },
  { label: 'مچ بالای ساعد', detail: 'مچ عقب نمی‌خوابد و وزنه بالای ساعد می‌ماند.' },
  { label: 'مسیر بدون ضربه', detail: 'وزنه پایین‌ترین نقطه را آرام لمس می‌کند و بازتاب نمی‌گیرد.' },
  { label: 'بدون قوس زیاد کمر', detail: 'دنده‌ها بالای لگن و کمر بدون گودشدن زیاد می‌ماند.' },
];

const pullStandards: MotionStandard[] = [
  { label: 'بدون تاب تنه', detail: 'تنه عقب نمی‌رود و از تاب دادن بدن کمک گرفته نمی‌شود.' },
  { label: 'کتف پایین و جمع', detail: 'حرکت با جمع شدن کتف آغاز می‌شود، نه با خم کردن آرنج.' },
  { label: 'کنترل بازگشت', detail: 'بازگشت وزنه آرام و کنترل‌شده است.' },
];

const armStandards: MotionStandard[] = [
  { label: 'آرنج ثابت', detail: 'آرنج کنار بدن می‌ماند و به جلو یا عقب نمی‌رود.' },
  { label: 'بدون تاب', detail: 'تنه و لگن برای بالا بردن وزنه تاب نمی‌خورند.' },
  { label: 'مچ خنثی', detail: 'مچ عقب نمی‌خوابد و وزنه بالای ساعد می‌ماند.' },
  { label: 'پایین بردن کنترل‌شده', detail: 'پایین بردن آهسته و کامل انجام می‌شود.' },
];

const machineStandards: MotionStandard[] = [
  { label: 'دامنهٔ کامل', detail: 'حرکت در دامنهٔ کامل و کنترل‌شده اجرا می‌شود.' },
  { label: 'بدون تاب', detail: 'تنه و لگن برای کمک به حرکت تاب نمی‌خورند.' },
  { label: 'توقف کوتاه', detail: 'در انتهای هر تکرار توقف کوتاهی وجود دارد.' },
];

const coreStandards: MotionStandard[] = [
  { label: 'بدون تاب', detail: 'بدن تاب نمی‌خورد و حرکت از عضلات شکم می‌آید.' },
  { label: 'لگن جمع می‌شود', detail: 'در انتهای حرکت لگن کمی به جلو جمع می‌شود.' },
  { label: 'پایین بردن آهسته', detail: 'پایین آمدن کنترل‌شده و بدون رها کردن است.' },
];

/* ------------------------------------------------------------------ squats */

const SQUAT_UP = { thigh: -6, knee: 12 };
const SQUAT_MID = { pelvis: 5, thigh: -38, knee: 52 };
const SQUAT_BOTTOM = { pelvis: 9, thigh: -74, knee: 104 };

/** Barbell squat with the bar locked across the upper back. */
const barbellSquat = (): MotionDefinition => {
  const hold = both('squat-grip', 102);
  return motion({
    id: 'barbell-squat',
    name: 'اسکوات پشت با هالتر',
    summary: 'اسکوات پشت: پایین‌رفتن کنترل‌شده تا عمق و بالا آمدن با کف پای ثابت و تنهٔ ثابت.',
    seconds: 3.4,
    equipment: [backBar()],
    standards: squatStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { legs: SQUAT_UP, arms: hold } },
      { phase: 1, label: 'پایین‌رفتن', inputs: { legs: SQUAT_MID, torso: 14, arms: hold } },
      { phase: 2, label: 'پایین‌ترین نقطه', inputs: { legs: SQUAT_BOTTOM, torso: 22, arms: hold } },
      { phase: 3, label: 'بالا آمدن', inputs: { legs: SQUAT_MID, torso: 14, arms: hold } },
    ],
  });
};

const bulgarianSplitSquat = (): MotionDefinition => {
  // The rear foot rests on a low bench behind the body. Its angles are solved
  // per key so that the ball of that foot stays on the bench instead of sliding.
  const hold = both('side', -38);
  const rear = (thigh: number, knee: number, ankle: number) => ({
    thigh_r: { x: thigh, z: -4 },
    calf_r: { hinge: knee },
    foot_r: { hinge: ankle },
  });
  return motion({
    id: 'bulgarian-split-squat',
    name: 'اسکوات بلغاری',
    summary: 'اسکوات بلغاری: پای جلو خم و راست می‌شود و پای عقب با کف پا روی نیمکت ثابت می‌ماند.',
    seconds: 3.2,
    plantBones: ['ball_l'],
    equipment: [dumbbells()],
    fixtures: [benchFixture([0, 0.15, -0.72], [0, 0, 0], [0.36, 0.3, 0.6])],
    standards: squatStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { legs: { thigh: -8, knee: 16 }, arms: hold, extra: rear(49.8, 10, 19.3) } },
      { phase: 1, label: 'پایین‌رفتن', inputs: { legs: { pelvis: 4, thigh: -34, knee: 48 }, torso: 8, arms: hold, extra: rear(25, 55, -4.3) } },
      { phase: 2, label: 'پایین‌ترین نقطه', inputs: { legs: { pelvis: 7, thigh: -60, knee: 92 }, torso: 14, arms: hold, extra: rear(20, 81, -1) } },
      { phase: 3, label: 'بالا آمدن', inputs: { legs: { pelvis: 4, thigh: -34, knee: 48 }, torso: 8, arms: hold, extra: rear(25, 55, -4.3) } },
    ],
  });
};

const legPress = (): MotionDefinition => {
  const root: [number, number, number] = [0, -0.17, -0.08];
  const hold = both('side', -38);
  return motion({
    id: 'leg-press',
    name: 'پرس پا',
    summary: 'پرس پا روی دستگاه: زانو از خم‌شدن کنترل‌شده تا باز شدن کامل ساق را فشار می‌دهد.',
    seconds: 3.2,
    plantBones: [],
    fixtures: [{ kind: 'machine', position: [0, 0.35, -0.55] }],
    standards: machineStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -52, legs: { thigh: -54, knee: 94 }, arms: hold }, root },
      { phase: 1, label: 'فشار دادن', inputs: { rootRot: -52, legs: { thigh: -40, knee: 62 }, arms: hold }, root },
      { phase: 2, label: 'زانوی باز', inputs: { rootRot: -52, legs: { thigh: -26, knee: 20 }, arms: hold }, root },
      { phase: 3, label: 'بازگشت کنترل‌شده', inputs: { rootRot: -52, legs: { thigh: -40, knee: 62 }, arms: hold }, root },
    ],
  });
};

const legExtension = (): MotionDefinition => {
  // Seated on the machine with the hands resting on the thighs, so nothing hangs
  // through the floor while the shins move.
  const hold = both('side', 24);
  return motion({
    id: 'leg-extension',
    name: 'جلو پا دستگاه',
    summary: 'جلو پا: زانو از حالت خم تا باز شدن کامل کشیده می‌شود و آهسته برمی‌گردد.',
    seconds: 2.8,
    fixtures: [{ kind: 'machine', position: [0, 0.3, -0.25] }],
    standards: machineStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -8, legs: { thigh: -80, knee: 96 }, arms: hold } },
      { phase: 1, label: 'کشیدن', inputs: { rootRot: -8, legs: { thigh: -80, knee: 52 }, arms: hold } },
      { phase: 2, label: 'زانوی باز', inputs: { rootRot: -8, legs: { thigh: -80, knee: 8 }, arms: hold } },
      { phase: 3, label: 'بازگشت', inputs: { rootRot: -8, legs: { thigh: -80, knee: 52 }, arms: hold } },
    ],
  });
};

const legCurl = (): MotionDefinition => {
  const hold = both('side', 24);
  return motion({
    id: 'leg-curl',
    name: 'پشت پا نشسته دستگاه',
    summary: 'پشت پا نشسته: زانو از حالت باز تا جمع شدن کامل ساق را جمع می‌کند.',
    seconds: 2.8,
    fixtures: [benchFixture([0, 0.26, -0.24])],
    standards: machineStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -6, legs: { thigh: -84, knee: 24 }, arms: hold } },
      { phase: 1, label: 'جمع کردن', inputs: { rootRot: -6, legs: { thigh: -84, knee: 70 }, arms: hold } },
      { phase: 2, label: 'جمع شدن کامل', inputs: { rootRot: -6, legs: { thigh: -84, knee: 112 }, arms: hold } },
      { phase: 3, label: 'بازگشت', inputs: { rootRot: -6, legs: { thigh: -84, knee: 70 }, arms: hold } },
    ],
  });
};

const calfRaise = (seated: boolean): MotionDefinition => {
  const hold = both('side', -38);
  // `ankle` is on top of the flat-foot solve: a small heel drop at the bottom
  // and a full heel lift at the top, with the ball of the foot held on the floor.
  const ankle = seated
    ? { before: { thigh: -84, knee: 92, ankle: -6 }, top: { thigh: -84, knee: 92, ankle: 40 } }
    : { before: { thigh: -4, knee: 10, ankle: -6 }, top: { thigh: -4, knee: 10, ankle: 40 } };
  const mid = (from: { thigh: number; knee: number; ankle?: number }, to: { ankle?: number }) => ({
    thigh: from.thigh,
    knee: from.knee,
    ankle: ((from.ankle ?? 0) + (to.ankle ?? 0)) / 2,
  });
  return motion({
    id: seated ? 'seated-calf-raise' : 'standing-calf-raise',
    name: seated ? 'ساق نشسته' : 'ساق ایستاده',
    summary: seated
      ? 'ساق نشسته: با زانوی خم، پاشنه پایین می‌رود و روی پنجه بالا می‌آید.'
      : 'ساق ایستاده: بلند شدن روی پنجه‌ها و پایین آمدن تا کشش کامل ساق.',
    seconds: 2.6,
    plantBones: ['ball_l', 'ball_r'],
    equipment: seated ? [] : [dumbbells()],
    fixtures: seated ? [benchFixture([0, 0.24, -0.2])] : undefined,
    standards: [
      { label: 'پاشنهٔ کامل', detail: 'در بالا تا حد امکان روی پنجه بلند می‌شوی.' },
      { label: 'بدون پرش', detail: 'بالا و پایین رفتن آرام و کنترل‌شده است.' },
      { label: 'زانو ثابت', detail: 'زانو در تمام مسیر تقریباً باز می‌ماند.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: seated ? -6 : 0, legs: ankle.before, arms: hold } },
      { phase: 1, label: 'بلند شدن', inputs: { rootRot: seated ? -6 : 0, legs: mid(ankle.before, ankle.top), arms: hold } },
      { phase: 2, label: 'روی پنجه', inputs: { rootRot: seated ? -6 : 0, legs: ankle.top, arms: hold } },
      { phase: 3, label: 'پایین آمدن', inputs: { rootRot: seated ? -6 : 0, legs: mid(ankle.before, ankle.top), arms: hold } },
    ],
  });
};

/* ------------------------------------------------------------------ hips */

const romanianDeadlift = (): MotionDefinition => {
  return motion({
    id: 'romanian-deadlift',
    name: 'ددلیفت رومانیایی',
    summary: 'ددلیفت رومانیایی: هالتر نزدیک ران با خم‌شدن از لگن پایین می‌رود و با صاف‌شدن لگن بالا می‌آید.',
    seconds: 3.4,
    equipment: [barbell()],
    standards: [
      { label: 'خم از لگن', detail: 'حرکت از عقب رفتن لگن آغاز می‌شود، نه از خم شدن زانو.' },
      { label: 'میله نزدیک بدن', detail: 'میله در تمام مسیر نزدیک ران می‌ماند.' },
      { label: 'کمر صاف', detail: 'ستون فقرات بدون گردشدن می‌ماند.' },
      { label: 'دامنهٔ کنترل‌شده', detail: 'پایین رفتن تا حدی است که کشش پشت ران حس شود.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { legs: { thigh: -8, knee: 14 }, arms: both('side', -30) } },
      { phase: 1, label: 'پایین رفتن', inputs: { legs: { pelvis: 8, thigh: -16, knee: 24 }, torso: 24, arms: both('side', -24) } },
      { phase: 2, label: 'انتهای کشش', inputs: { legs: { pelvis: 14, thigh: -24, knee: 34 }, torso: 46, arms: both('bent-hang', -18) } },
      { phase: 3, label: 'بالا آمدن', inputs: { legs: { pelvis: 8, thigh: -16, knee: 24 }, torso: 24, arms: both('side', -24) } },
    ],
  });
};

/* ----------------------------------------------------------------- presses */

const FLAT_BENCH = benchFixture([0, 0.225, -0.95]);
/** Thin pad under an inclined body: measured so the body's back rests on it. */
const INCLINE_BENCH = benchFixture([0, 0.505, -0.32], [30, 0, 0], [0.36, 0.2, 1.1]);
const INCLINE_PAD_28 = benchFixture([0, 0.5, -0.32], [28, 0, 0], [0.36, 0.2, 1.1]);
const SEATED_BENCH = benchFixture([0, 0.24, -0.2]);

const benchPress = (options: {
  id: string;
  name: string;
  summary: string;
  incline: number;
  equipment: MotionEquipment[];
  legs: PoseInputs['legs'];
  rootOffset: [number, number, number];
  fixture: MotionFixture;
}): MotionDefinition =>
  motion({
    id: options.id,
    name: options.name,
    summary: options.summary,
    seconds: 3,
    plantBones: [],
    equipment: options.equipment,
    fixtures: [options.fixture],
    standards: pressStandards,
    keys: [
      {
        phase: 0,
        label: 'آماده',
        inputs: { rootRot: -90 + options.incline, legs: options.legs, arms: at('press-forward-lockout', -46) },
        root: options.rootOffset,
      },
      {
        phase: 1,
        label: 'پایین‌بردن',
        inputs: { rootRot: -90 + options.incline, legs: options.legs, arms: at('press-forward-mid', 47) },
        root: options.rootOffset,
      },
      {
        phase: 2,
        label: 'لمس سینه',
        inputs: { rootRot: -90 + options.incline, legs: options.legs, arms: at('press-touch', 89) },
        root: options.rootOffset,
      },
      {
        phase: 3,
        label: 'پرس کردن',
        inputs: { rootRot: -90 + options.incline, legs: options.legs, arms: at('press-forward-mid', 47) },
        root: options.rootOffset,
      },
    ],
  });

const shoulderPress = (): MotionDefinition =>
  motion({
    id: 'shoulder-press',
    name: 'پرس سرشانهٔ نشسته با دمبل',
    summary: 'پرس سرشانهٔ نشسته: دمبل‌ها از کنار شانه‌ها تا بالای سر پرس می‌شوند.',
    seconds: 3,
    equipment: [dumbbells()],
    fixtures: [SEATED_BENCH],
    standards: pressStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('shoulder-bottom', 79) } },
      { phase: 1, label: 'بالا بردن', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('shoulder-bottom', 30) } },
      { phase: 2, label: 'بالای سر', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('press-lockout', -30) } },
      { phase: 3, label: 'پایین بردن', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('shoulder-bottom', 30) } },
    ],
  });

const lateralRaise = (options: { id: string; name: string; summary: string; equipment: MotionEquipment[] }): MotionDefinition =>
  motion({
    id: options.id,
    name: options.name,
    summary: options.summary,
    seconds: 2.6,
    equipment: options.equipment,
    standards: [
      { label: 'آرنج کمی خم', detail: 'زاویهٔ آرنج در تمام مسیر تقریباً ثابت می‌ماند.' },
      { label: 'بدون تاب و پرش', detail: 'بالا بردن وزنه از حرکت شانه می‌آید، نه از تاب بدن.' },
      { label: 'حد ارتفاع شانه', detail: 'دست‌ها بالاتر از سطح شانه نمی‌روند.' },
      { label: 'شانه پایین', detail: 'شانه‌ها به سمت گوش بالا نمی‌آیند.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { arms: both('lateral-bottom', 27) } },
      { phase: 1, label: 'بالا بردن', inputs: { arms: both('lateral-bottom', 0) } },
      { phase: 2, label: 'هم‌سطحی شانه', inputs: { arms: both('lateral-top', -30) } },
      { phase: 3, label: 'پایین بردن', inputs: { arms: both('lateral-bottom', 0) } },
    ],
  });

const cableFly = (): MotionDefinition =>
  motion({
    id: 'cable-fly',
    name: 'قفسهٔ سینه با سیم‌کش',
    summary: 'قفسهٔ سینه: دست‌ها در قوسی کنترل‌شده از طرفین تا جلوی سینه به هم می‌رسند.',
    seconds: 2.8,
    equipment: [cable('both-hands', { l: [0.85, 1.35, 0.2], r: [-0.85, 1.35, 0.2] })],
    standards: [
      { label: 'آرنج کمی خم', detail: 'زاویهٔ آرنج ثابت می‌ماند و حرکت به پرس تبدیل نمی‌شود.' },
      { label: 'کتف ثابت', detail: 'شانه‌ها به جلو نمی‌چرخند.' },
      { label: 'دامنهٔ راحت', detail: 'کشش سینه تا حدی است که شانه راحت بماند.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { arms: both('fly-open', -21) } },
      { phase: 1, label: 'جمع کردن', inputs: { arms: both('fly-open', 30) } },
      { phase: 2, label: 'جلوی سینه', inputs: { arms: both('fly-closed', 72) } },
      { phase: 3, label: 'باز کردن', inputs: { arms: both('fly-open', 30) } },
    ],
  });

const reverseFly = (): MotionDefinition =>
  motion({
    id: 'reverse-fly',
    name: 'نشر خم دستگاه',
    summary: 'نشر خم روی دستگاه با تکیه‌گاه سینه: بازوها از زیر بدن تا هم‌سطحی شانه باز می‌شوند.',
    seconds: 2.8,
    plantBones: [],
    fixtures: [{ kind: 'machine', position: [0, 0.42, -0.2] }],
    standards: [
      { label: 'تنهٔ ثابت', detail: 'سینه روی تکیه‌گاه می‌ماند و تنه حرکت نمی‌کند.' },
      { label: 'آرنج کمی خم', detail: 'آرنج کمی خم می‌ماند و مسیر قوسی است.' },
      { label: 'بدون تاب', detail: 'بالا بردن وزنه از تاب دادن بدن نمی‌آید.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-fly-down', -2) } },
      { phase: 1, label: 'بالا بردن', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-fly-open', -16) } },
      { phase: 2, label: 'هم‌سطحی شانه', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-fly-open', -31) } },
      { phase: 3, label: 'پایین بردن', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-fly-open', -16) } },
    ],
  });

/* -------------------------------------------------------------------- arms */

const curl = (options: {
  id: string;
  name: string;
  summary: string;
  equipment: MotionEquipment[];
  top?: number;
  standards?: MotionStandard[];
  rootRot?: number;
  rootOffset?: [number, number, number];
  legs?: PoseInputs['legs'];
  fixture?: MotionFixture;
  shoulder?: number;
}): MotionDefinition => {
  const top = options.top ?? 105;
  const shifted: keyof typeof armPoses = 'side';
  const arms = (hinge: number): PoseInputs['arms'] => {
    const solved = armPoses[shifted];
    const upperarm: JointRotation = { ...solved.upperarm };
    if (options.shoulder) upperarm.x = (upperarm.x ?? 0) + options.shoulder;
    return { upperarm, lowerarm: { hinge } };
  };
  return motion({
    id: options.id,
    name: options.name,
    summary: options.summary,
    seconds: 2.8,
    equipment: options.equipment,
    fixtures: options.fixture ? [options.fixture] : undefined,
    standards: options.standards ?? armStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: options.rootRot, legs: options.legs, arms: arms(-43) }, root: options.rootOffset },
      { phase: 1, label: 'بالا آوردن', inputs: { rootRot: options.rootRot, legs: options.legs, arms: arms(20) }, root: options.rootOffset },
      { phase: 2, label: 'بالاترین نقطه', inputs: { rootRot: options.rootRot, legs: options.legs, arms: arms(top) }, root: options.rootOffset },
      { phase: 3, label: 'پایین بردن', inputs: { rootRot: options.rootRot, legs: options.legs, arms: arms(20) }, root: options.rootOffset },
    ],
  });
};

const tricepsPushdown = (id: string, name: string, summary: string): MotionDefinition =>
  motion({
    id,
    name,
    summary,
    seconds: 2.6,
    equipment: [cable('both-hands', { l: [0.25, 2.05, 0.45], r: [-0.25, 2.05, 0.45] })],
    standards: [
      { label: 'آرنج چسبیده', detail: 'آرنج کنار بدن ثابت می‌ماند و به عقب نمی‌رود.' },
      { label: 'بدون کمک تنه', detail: 'تنه برای پایین بردن وزنه به جلو خم نمی‌شود.' },
      { label: 'باز شدن کامل', detail: 'در انتها آرنج کامل باز می‌شود.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { arms: both('side', 78) } },
      { phase: 1, label: 'پایین بردن', inputs: { arms: both('side', 16) } },
      { phase: 2, label: 'آرنج باز', inputs: { arms: both('side', -35) } },
      { phase: 3, label: 'بازگشت', inputs: { arms: both('side', 16) } },
    ],
  });

const overheadExtension = (): MotionDefinition =>
  motion({
    id: 'overhead-cable-triceps-extension',
    name: 'پشت بازو بالای سر با سیم‌کش',
    summary: 'پشت بازو بالای سر: آرنج‌ها بالا می‌مانند و ساعد از پشت سر رو به بالا باز می‌شود.',
    seconds: 2.8,
    equipment: [cable('both-hands', { l: [0.3, 0.35, -0.7], r: [-0.3, 0.35, -0.7] })],
    standards: [
      { label: 'آرنج رو به جلو', detail: 'آرنج‌ها بالا و رو به جلو می‌مانند.' },
      { label: 'کمر ثابت', detail: 'قوس کمر زیاد نمی‌شود.' },
      { label: 'دامنهٔ کامل', detail: 'کشش پشت بازو در پایین و باز شدن کامل در بالا.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { arms: both('overhead-ext', 82) } },
      { phase: 1, label: 'بالا بردن', inputs: { arms: both('overhead-ext', 20) } },
      { phase: 2, label: 'آرنج باز', inputs: { arms: both('overhead-ext', -30) } },
      { phase: 3, label: 'بازگشت', inputs: { arms: both('overhead-ext', 20) } },
    ],
  });

/* -------------------------------------------------------------------- pull */

const pulldown = (id: string, name: string, summary: string): MotionDefinition =>
  motion({
    id,
    name,
    summary,
    seconds: 3,
    equipment: [cable('both-hands', { l: [0.2, 2.15, 0.1], r: [-0.2, 2.15, 0.1] })],
    fixtures: [SEATED_BENCH],
    standards: pullStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('pulldown-top', -29) } },
      { phase: 1, label: 'پایین کشیدن', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('pulldown-top', 20) } },
      { phase: 2, label: 'میله بالای سینه', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('pulldown-bottom', 81) } },
      { phase: 3, label: 'بازگشت', inputs: { rootRot: -6, legs: { thigh: -84, knee: 88 }, arms: both('pulldown-top', 20) } },
    ],
  });

const seatedRow = (): MotionDefinition =>
  motion({
    id: 'seated-cable-row',
    name: 'قایقی سیم‌کش نشسته',
    summary: 'قایقی نشسته: دسته‌ها از کشش کامل جلو تا نزدیک تنه کشیده می‌شوند و کتف جمع می‌شود.',
    seconds: 3,
    equipment: [cable('both-hands', { l: [0.3, 0.55, 1.4], r: [-0.3, 0.55, 1.4] })],
    fixtures: [SEATED_BENCH],
    standards: pullStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { rootRot: -6, legs: { thigh: -78, knee: 84 }, arms: both('row-up-extended', -35) } },
      { phase: 1, label: 'کشیدن', inputs: { rootRot: -6, legs: { thigh: -78, knee: 84 }, arms: both('row-up-extended', 15) } },
      { phase: 2, label: 'نزدیک تنه', inputs: { rootRot: -6, legs: { thigh: -78, knee: 84 }, arms: both('row-up-pulled', 65) } },
      { phase: 3, label: 'بازگشت', inputs: { rootRot: -6, legs: { thigh: -78, knee: 84 }, arms: both('row-up-extended', 15) } },
    ],
  });

const machineRow = (): MotionDefinition =>
  motion({
    id: 'machine-row',
    name: 'قایقی دستگاه با تکیه‌گاه سینه',
    summary: 'قایقی با تکیه‌گاه سینه: دسته‌ها تا نزدیک تنه کشیده می‌شوند و کتف‌ها جمع می‌شوند.',
    seconds: 3,
    plantBones: [],
    fixtures: [{ kind: 'machine', position: [0, 0.42, -0.2] }],
    standards: pullStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-hang', -17) } },
      { phase: 1, label: 'کشیدن', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-hang', 20) } },
      { phase: 2, label: 'نزدیک تنه', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-pulled', 62) } },
      { phase: 3, label: 'بازگشت', inputs: { torso: 46, legs: { pelvis: 6, thigh: -14, knee: 22 }, arms: both('bent-hang', 20) } },
    ],
  });

const oneArmRow = (): MotionDefinition =>
  motion({
    id: 'one-arm-dumbbell-row',
    name: 'قایقی تک‌دمبل',
    summary: 'قایقی تک‌دمبل با تنهٔ خم: دمبل از کشش کامل پایین تا نزدیک پهلو کشیده می‌شود.',
    seconds: 3,
    equipment: [dumbbellLeft()],
    standards: [
      { label: 'کمر صاف', detail: 'پشت بدون گردشدن و بدون چرخش می‌ماند.' },
      { label: 'آرنج نزدیک بدن', detail: 'آرنج از بدن دور نمی‌شود.' },
      { label: 'بدون چرخش تنه', detail: 'تنه به چپ و راست نمی‌چرخد.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { legs: { pelvis: 6, thigh: -14, knee: 22 }, torso: 46, arms: one('bent-hang', -17), extra: { upperarm_r: { ...armPoses['side'].upperarm }, lowerarm_r: { hinge: -10 } } } },
      { phase: 1, label: 'کشیدن', inputs: { legs: { pelvis: 6, thigh: -14, knee: 22 }, torso: 46, arms: one('bent-hang', 22), extra: { upperarm_r: { ...armPoses['side'].upperarm }, lowerarm_r: { hinge: -10 } } } },
      { phase: 2, label: 'نزدیک پهلو', inputs: { legs: { pelvis: 6, thigh: -14, knee: 22 }, torso: 46, arms: one('bent-pulled', 62), extra: { upperarm_r: { ...armPoses['side'].upperarm }, lowerarm_r: { hinge: -10 } } } },
      { phase: 3, label: 'بازگشت', inputs: { legs: { pelvis: 6, thigh: -14, knee: 22 }, torso: 46, arms: one('bent-hang', 22), extra: { upperarm_r: { ...armPoses['side'].upperarm }, lowerarm_r: { hinge: -10 } } } },
    ],
  });

const facePull = (): MotionDefinition =>
  motion({
    id: 'face-pull',
    name: 'فیس‌پول با سیم‌کش',
    summary: 'فیس‌پول: طناب از روبه‌رو به سمت صورت کشیده می‌شود و آرنج‌ها بالا و باز می‌مانند.',
    seconds: 2.8,
    equipment: [cable('both-hands', { l: [0.15, 1.75, 0.8], r: [-0.15, 1.75, 0.8] })],
    standards: [
      { label: 'آرنج بالا', detail: 'آرنج‌ها هم‌سطح یا بالاتر از شانه می‌مانند.' },
      { label: 'بدون قوس کمر', detail: 'کمر گود نمی‌شود و تنه ثابت است.' },
      { label: 'کشش به سمت صورت', detail: 'طناب به سمت صورت کشیده می‌شود، نه به سمت سینه.' },
    ],
    keys: [
      { phase: 0, label: 'آماده', inputs: { arms: both('face-pull-out', -10) } },
      { phase: 1, label: 'کشیدن', inputs: { arms: both('face-pull-out', 30) } },
      { phase: 2, label: 'کنار صورت', inputs: { arms: both('face-pull-in', 64) } },
      { phase: 3, label: 'بازگشت', inputs: { arms: both('face-pull-out', 30) } },
    ],
  });

/* -------------------------------------------------------------------- core */

const cableCrunch = (): MotionDefinition => {
  // Kneeling under a high pulley: the thighs stay put, the hips hinge, and the
  // trunk curls down from the pelvis. The upper body leans forward at every key
  // because a kneeling torso is never vertical.
  const root: [number, number, number] = [0, -0.5, 0.14];
  const hold = both('overhead-ext', 82);
  const kneel = { thigh: -22, knee: 128 };
  return motion({
    id: 'cable-crunch',
    name: 'کرانچ زانو زده با سیم‌کش',
    summary: 'کرانچ زانو زده: با لگن ثابت و کمر گرد، تنه به سمت پایین جمع می‌شود و کنترل‌شده برمی‌گردد.',
    seconds: 3,
    plantBones: [],
    equipment: [cable('both-hands', { l: [0.15, 2.0, 0.5], r: [-0.15, 2.0, 0.5] })],
    standards: coreStandards,
    keys: [
      { phase: 0, label: 'آماده', inputs: { legs: kneel, torso: 18, head: -18, arms: hold }, root },
      { phase: 1, label: 'جمع کردن', inputs: { legs: kneel, torso: 40, head: -40, arms: hold }, root },
      { phase: 2, label: 'بالاترین جمع‌شدن', inputs: { legs: kneel, torso: 54, head: -54, arms: hold }, root },
      { phase: 3, label: 'بازگشت', inputs: { legs: kneel, torso: 40, head: -40, arms: hold }, root },
    ],
  });
};

const hangingLegRaise = (): MotionDefinition => {
  // Hands on the bar, body hanging under it: the bar is the pivot for the legs.
  const root: [number, number, number] = [0, 0.6, 0];
  const hold = both('hang', -26);
  return motion({
    id: 'hanging-leg-raise',
    name: 'بالا آوردن پا از بارفیکس',
    summary: 'آویزان از بارفیکس: با لگن جمع‌شده زانوها تا بالا می‌آیند و آهسته پایین می‌روند.',
    seconds: 3.2,
    plantBones: [],
    fixtures: [{ kind: 'pull-up-bar', position: [0, 2.71, 0.02] }],
    standards: coreStandards,
    keys: [
      { phase: 0, label: 'آویزان', inputs: { legs: { thigh: -4, knee: 12 }, arms: hold }, root },
      { phase: 1, label: 'بالا بردن', inputs: { legs: { thigh: -46, knee: 46 }, torso: 6, arms: hold }, root },
      { phase: 2, label: 'بالاترین نقطه', inputs: { legs: { thigh: -88, knee: 76 }, torso: 12, arms: hold }, root },
      { phase: 3, label: 'پایین بردن', inputs: { legs: { thigh: -46, knee: 46 }, torso: 6, arms: hold }, root },
    ],
  });
};

/* ----------------------------------------------------------------- the map */

const catalogue: MotionDefinition[] = [
  barbellSquat(),
  bulgarianSplitSquat(),
  legPress(),
  legExtension(),
  legCurl(),
  calfRaise(false),
  calfRaise(true),
  romanianDeadlift(),
  benchPress({
    id: 'barbell-bench-press',
    name: 'پرس سینه با هالتر',
    summary: 'پرس سینه روی نیمکت صاف: میله آرام تا سینه پایین می‌آید و تا باز شدن آرنج‌ها پرس می‌شود.',
    incline: 0,
    equipment: [barbell()],
    legs: { thigh: -4, knee: 94 },
    rootOffset: [0, 0.55, 0],
    fixture: FLAT_BENCH,
  }),
  benchPress({
    id: 'incline-barbell-press',
    name: 'پرس بالاسینه با هالتر',
    summary: 'پرس بالاسینه روی نیمکت شیب‌دار: میله از بالای سینه پایین می‌آید و رو به بالا پرس می‌شود.',
    incline: 30,
    equipment: [barbell()],
    legs: { thigh: -30, knee: 90 },
    rootOffset: [0, 0.075, 0.865],
    fixture: INCLINE_BENCH,
  }),
  benchPress({
    id: 'incline-dumbbell-press',
    name: 'پرس بالاسینه با دمبل',
    summary: 'پرس بالاسینه با دمبل: دو دمبل با مسیر کنترل‌شده از کنار سینهٔ بالایی تا بالای شانه‌ها.',
    incline: 28,
    equipment: [dumbbells()],
    legs: { thigh: -28, knee: 90 },
    rootOffset: [0, 0.105, 0.882],
    fixture: INCLINE_PAD_28,
  }),
  benchPress({
    id: 'machine-chest-press',
    name: 'پرس سینه دستگاه',
    summary: 'پرس سینه دستگاه: دسته‌ها از کنار سینه تا باز شدن کامل آرنج‌ها جلو می‌روند.',
    incline: 12,
    equipment: [],
    legs: { thigh: -12, knee: 90 },
    rootOffset: [0, 0.365, -0.022],
    fixture: benchFixture([0, 0.35, -1.02], [12, 0, 0], [0.36, 0.2, 1.1]),
  }),
  shoulderPress(),
  lateralRaise({
    id: 'lateral-raise',
    name: 'نشر از جانب با دمبل',
    summary: 'نشر از جانب: بازوها با آرنج کمی خم از کنار بدن تا هم‌سطحی شانه بالا می‌روند.',
    equipment: [dumbbells()],
  }),
  lateralRaise({
    id: 'cable-lateral-raise',
    name: 'نشر از جانب تک‌دست با سیم‌کش',
    summary: 'نشر از جانب با یک دست و سیم‌کش کم: دست از کنار بدن تا هم‌سطحی شانه بالا می‌رود.',
    equipment: [cable('left-hand', { l: [0.55, 0.15, -0.35] })],
  }),
  cableFly(),
  reverseFly(),
  curl({ id: 'barbell-curl', name: 'جلوبازو با هالتر', summary: 'جلوبازو ایستاده با هالتر: بالا آوردن میله با آرنج ثابت و پایین بردن کنترل‌شده.', equipment: [barbell()] }),
  curl({ id: 'cable-curl', name: 'جلوبازو با سیم‌کش', summary: 'جلوبازو با سیم‌کش کم: کشش مداوم سیم‌کش با آرنج ثابت و دامنهٔ کامل.', equipment: [cable('both-hands', { l: [0.2, 0.15, 0.55], r: [-0.2, 0.15, 0.55] })] }),
  curl({
    id: 'hammer-curl',
    name: 'جلوبازو چکشی با دمبل',
    summary: 'جلوبازو چکشی: دمبل‌ها با مچ خنثی و آرنج ثابت بالا و پایین می‌روند.',
    equipment: [dumbbells()],
    standards: [
      { label: 'مچ خنثی', detail: 'کف دست‌ها رو به هم می‌مانند و مچ نمی‌چرخد.' },
      { label: 'آرنج ثابت', detail: 'آرنج کنار بدن می‌ماند و به جلو نمی‌آید.' },
      { label: 'بدون تاب', detail: 'تنه و لگن تاب نمی‌خورند.' },
    ],
  }),
  curl({
    id: 'incline-dumbbell-curl',
    name: 'جلوبازو روی نیمکت شیب‌دار',
    summary: 'جلوبازو روی نیمکت شیب‌دار: بازوها زیر بدن آویزان می‌مانند و دامنهٔ کامل با آرنج ثابت اجرا می‌شود.',
    equipment: [dumbbells()],
    rootRot: -50,
    rootOffset: [0, 0.05, 0.9],
    fixture: INCLINE_BENCH,
    // The trunk is reclined, so the arms carry the recline to keep hanging.
    shoulder: 50,
    standards: [
      { label: 'بازو آویزان', detail: 'بازوها پشت بدن آویزان می‌مانند و به جلو نمی‌آیند.' },
      { label: 'آرنج ثابت', detail: 'آرنج در تمام مسیر ثابت می‌ماند.' },
      { label: 'دامنهٔ کامل', detail: 'پایین بردن تا کشش کامل و بالا بردن بدون تاب.' },
    ],
  }),
  tricepsPushdown('cable-triceps-pushdown', 'پشت بازو با سیم‌کش', 'پشت بازو با سیم‌کش: آرنج ثابت کنار بدن و باز شدن کامل آرنج به پایین.'),
  tricepsPushdown('rope-triceps-pushdown', 'پشت بازو با طناب', 'پشت بازو با طناب: همان الگوی سیم‌کش با طناب، آرنج ثابت و باز شدن کامل.'),
  overheadExtension(),
  pulldown('lat-pulldown', 'زیربغل سیم‌کش', 'زیربغل: میله از بالای سر تا بالای سینه پایین کشیده می‌شود و با کنترل برمی‌گردد.'),
  pulldown('neutral-grip-lat-pulldown', 'زیربغل دست‌شست‌دار', 'زیربغل با دست‌شست‌دار: میله با آرنج رو به پایین تا بالای سینه کشیده می‌شود.'),
  seatedRow(),
  machineRow(),
  oneArmRow(),
  facePull(),
  cableCrunch(),
  hangingLegRaise(),
];

export const motions: Record<string, MotionDefinition> = Object.fromEntries(
  catalogue.map((entry) => [entry.id, entry]),
);

export const motionById = (id: string): MotionDefinition | undefined => motions[id];
export const motionIds = Object.keys(motions);
