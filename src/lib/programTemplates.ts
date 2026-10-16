import { workoutTemplates as originalRageProgram, estimateMinutes } from '../data/workouts';
import { exerciseNames } from '../data/exerciseNames';
import type { WorkoutExercise, WorkoutTemplate } from '../types';
import type { ProgramDay } from './api';

export interface PresetTemplate {
  id: string;
  title: string;
  tagline: string;
  badge: string;
  description: string;
  daysCount: number;
  exercisesCount: number;
  buildWorkoutTemplates: () => WorkoutTemplate[];
  buildProgramDays: () => ProgramDay[];
}

const p = (sets: number, minReps: number, maxReps: number, restSeconds: number, note?: string) => ({
  sets,
  minReps,
  maxReps,
  targetRirLabel: '1–2',
  minimumRir: 1,
  restSeconds,
  note,
});

const ex = (exerciseId: string, sets: number, minReps: number, maxReps: number, restSeconds: number, customName?: string, note?: string): WorkoutExercise => ({
  exerciseId,
  name: customName ?? exerciseNames[exerciseId] ?? exerciseId,
  prescription: p(sets, minReps, maxReps, restSeconds, note),
});

const toProgramDay = (name: string, items: { exerciseId: string; name: string; muscle: string; sets: number; reps: string; restSeconds: number }[]): ProgramDay => ({
  name,
  exercises: items,
});

/** 3-Day Full Body */
function buildFullBodyTemplates(): WorkoutTemplate[] {
  const day1: WorkoutExercise[] = [
    ex('barbell-squat', 3, 6, 8, 120, 'اسکوات با هالتر', 'گرم کردن کافی قبل از ست اصلی.'),
    ex('barbell-bench-press', 3, 6, 8, 120, 'پرس سینه با هالتر'),
    ex('lat-pulldown', 3, 8, 10, 90, 'زیر بغل سیم‌کش از بالا'),
    ex('overhead-cable-triceps-extension', 3, 10, 12, 90, 'پشت بازو سیم‌کش بالای سر'),
    ex('cable-crunch', 3, 12, 15, 60, 'شکم سیم‌کش زانو زده'),
  ];
  const day2: WorkoutExercise[] = [
    ex('romanian-deadlift', 3, 6, 8, 150, 'ددلیفت رومانیایی', 'کشش کامل همسترینگ با ستون فقرات خنثی.'),
    ex('shoulder-press', 3, 8, 10, 120, 'پرس سرشانه نشسته با دمبل'),
    ex('seated-cable-row', 3, 8, 10, 90, 'زیربغل قایقی سیم‌کش'),
    ex('barbell-curl', 3, 8, 10, 90, 'جلو بازو با هالتر'),
    ex('plank', 3, 30, 45, 60, 'پلانک روی ساعد', 'مدت هر ست به ثانیه است.'),
  ];
  const day3: WorkoutExercise[] = [
    ex('leg-press', 3, 8, 10, 120, 'پرس پا دستگاه'),
    ex('incline-dumbbell-press', 3, 8, 10, 90, 'پرس بالاسینه با دمبل'),
    ex('pull-up', 3, 6, 8, 120, 'بارفیکس'),
    ex('lateral-raise', 3, 12, 15, 60, 'نشر جانب با دمبل'),
    ex('standing-calf-raise', 3, 10, 15, 60, 'ساق پا ایستاده'),
  ];

  return [
    {
      id: 'template-fb-1',
      name: 'روز ۱: تمام بدن (اسکوات و سینه)',
      dayLabel: 'روز ۰۱',
      focus: 'چهارسر ران · سینه · پشت · پشت بازو · میان‌تنه',
      durationMinutes: estimateMinutes(day1),
      description: 'جلسهٔ متوازن با تمرکز بر اسکوات، پرس سینه و لت سیم‌کش.',
      exercises: day1,
    },
    {
      id: 'template-fb-2',
      name: 'روز ۲: تمام بدن (ددلیفت و سرشانه)',
      dayLabel: 'روز ۰۲',
      focus: 'همسترینگ · سرشانه · پشت · جلو بازو · شکم',
      durationMinutes: estimateMinutes(day2),
      description: 'حرکت زنجیرهٔ خلفی همراه با بالاتنه و میان‌تنه.',
      exercises: day2,
    },
    {
      id: 'template-fb-3',
      name: 'روز ۳: تمام بدن (حجم و پایانی)',
      dayLabel: 'روز ۰۳',
      focus: 'پا · بالاسینه · زیربغل · دلتوئید جانبی · ساق',
      durationMinutes: estimateMinutes(day3),
      description: 'پرس پا، بالاسینه دمبل، بارفیکس و حرکات کمکی متمرکز.',
      exercises: day3,
    },
  ];
}

/** 4-Day Upper / Lower */
function buildUpperLowerTemplates(): WorkoutTemplate[] {
  const day1: WorkoutExercise[] = [
    ex('barbell-bench-press', 4, 5, 5, 120, 'پرس سینه با هالتر', 'ست‌های اصلی قدرتی.'),
    ex('barbell-bent-over-row', 4, 6, 8, 120, 'زیربغل هالتر خم'),
    ex('shoulder-press', 3, 8, 10, 90, 'پرس سرشانه نشسته با دمبل'),
    ex('barbell-curl', 3, 8, 10, 90, 'جلو بازو با هالتر'),
    ex('cable-triceps-pushdown', 3, 10, 12, 75, 'پشت بازو سیم‌کش'),
  ];
  const day2: WorkoutExercise[] = [
    ex('barbell-squat', 4, 5, 5, 150, 'اسکوات با هالتر', 'فرم استاندارد و عمق کامل.'),
    ex('romanian-deadlift', 3, 6, 8, 120, 'ددلیفت رومانیایی'),
    ex('leg-extension', 3, 10, 12, 75, 'جلو پا دستگاه'),
    ex('standing-calf-raise', 4, 10, 12, 60, 'ساق پا ایستاده'),
    ex('machine-crunch', 3, 12, 15, 60, 'شکم کرانچ دستگاه'),
  ];
  const day3: WorkoutExercise[] = [
    ex('incline-dumbbell-press', 3, 8, 10, 90, 'پرس بالاسینه با دمبل'),
    ex('lat-pulldown', 3, 8, 10, 90, 'زیر بغل سیم‌کش از بالا'),
    ex('lateral-raise', 4, 12, 15, 60, 'نشر جانب با دمبل'),
    ex('seated-cable-row', 3, 10, 12, 75, 'زیربغل قایقی سیم‌کش'),
    ex('overhead-cable-triceps-extension', 3, 10, 12, 75, 'پشت بازو بالای سر سیم‌کش'),
    ex('hammer-curl', 3, 10, 12, 75, 'جلو بازو چکشی با دمبل'),
  ];
  const day4: WorkoutExercise[] = [
    ex('leg-press', 4, 8, 10, 120, 'پرس پا دستگاه'),
    ex('leg-curl', 3, 10, 12, 75, 'پشت پا دستگاه خوابیده/نشسته'),
    ex('goblet-squat', 3, 10, 12, 90, 'گابلت اسکوات با دمبل'),
    ex('standing-calf-raise', 3, 12, 15, 60, 'ساق پا ایستاده'),
    ex('plank', 3, 40, 60, 60, 'پلانک روی ساعد'),
  ];

  return [
    {
      id: 'template-ul-1',
      name: 'روز ۱: بالاتنه قدرتی',
      dayLabel: 'روز ۰۱',
      focus: 'سینه · پشت · سرشانه · دست‌ها',
      durationMinutes: estimateMinutes(day1),
      description: 'تمرکز بر بارهای سنگین‌تر و حرکات پایه‌ای بالاتنه.',
      exercises: day1,
    },
    {
      id: 'template-ul-2',
      name: 'روز ۲: پایین‌تنه قدرتی',
      dayLabel: 'روز ۰۲',
      focus: 'چهارسر · همسترینگ · ساق · شکم',
      durationMinutes: estimateMinutes(day2),
      description: 'اسکوات سنگین و ددلیفت رومانیایی با حرکات مکمل.',
      exercises: day2,
    },
    {
      id: 'template-ul-3',
      name: 'روز ۳: بالاتنه هایپرتروفی',
      dayLabel: 'روز ۰۳',
      focus: 'سینه · عضلات پشت · دلتوئید جانبی · بازو',
      durationMinutes: estimateMinutes(day3),
      description: 'دامنه تکرار متوسط تا بالا برای رشد و پمپاژ عضلانی.',
      exercises: day3,
    },
    {
      id: 'template-ul-4',
      name: 'روز ۴: پایین‌تنه هایپرتروفی',
      dayLabel: 'روز ۰۴',
      focus: 'چهارسر · سرینی · همسترینگ · ساق · میان‌تنه',
      durationMinutes: estimateMinutes(day4),
      description: 'پرس پا، گابلت اسکوات و تثبیت زنجیره حرکتی.',
      exercises: day4,
    },
  ];
}

/** 5-Day Push / Pull / Legs */
function buildPplTemplates(): WorkoutTemplate[] {
  const push: WorkoutExercise[] = [
    ex('barbell-bench-press', 4, 6, 8, 120, 'پرس سینه با هالتر'),
    ex('incline-dumbbell-press', 3, 8, 10, 90, 'پرس بالاسینه با دمبل'),
    ex('shoulder-press', 3, 8, 10, 90, 'پرس سرشانه نشسته با دمبل'),
    ex('lateral-raise', 4, 12, 15, 60, 'نشر جانب با دمبل'),
    ex('cable-triceps-pushdown', 3, 10, 12, 75, 'پشت بازو سیم‌کش'),
    ex('overhead-cable-triceps-extension', 3, 10, 12, 75, 'پشت بازو بالای سر سیم‌کش'),
  ];
  const pull: WorkoutExercise[] = [
    ex('pull-up', 4, 6, 8, 120, 'بارفیکس'),
    ex('barbell-bent-over-row', 3, 6, 8, 90, 'زیربغل هالتر خم'),
    ex('lat-pulldown', 3, 8, 10, 90, 'زیر بغل سیم‌کش از بالا'),
    ex('face-pull', 3, 12, 15, 60, 'فیس پول سیم‌کش'),
    ex('barbell-curl', 3, 8, 10, 75, 'جلو بازو با هالتر'),
    ex('hammer-curl', 3, 10, 12, 75, 'جلو بازو چکشی'),
  ];
  const legs: WorkoutExercise[] = [
    ex('barbell-squat', 4, 6, 8, 150, 'اسکوات با هالتر'),
    ex('romanian-deadlift', 3, 6, 8, 120, 'ددلیفت رومانیایی'),
    ex('leg-press', 3, 10, 12, 90, 'پرس پا دستگاه'),
    ex('leg-extension', 3, 10, 12, 75, 'جلو پا دستگاه'),
    ex('standing-calf-raise', 4, 12, 15, 60, 'ساق پا ایستاده'),
    ex('machine-crunch', 3, 15, 20, 60, 'شکم کرانچ دستگاه'),
  ];
  const upper: WorkoutExercise[] = [
    ex('incline-barbell-press', 3, 6, 8, 120, 'پرس بالاسینه با هالتر'),
    ex('seated-cable-row', 3, 8, 10, 90, 'زیربغل قایقی سیم‌کش'),
    ex('lateral-raise', 3, 12, 15, 60, 'نشر جانب با دمبل'),
    ex('cable-fly', 3, 10, 12, 75, 'قفسه سینه سیم‌کش'),
    ex('barbell-curl', 3, 10, 12, 75, 'جلو بازو با هالتر'),
    ex('cable-triceps-pushdown', 3, 10, 12, 75, 'پشت بازو سیم‌کش'),
  ];
  const lower: WorkoutExercise[] = [
    ex('leg-press', 4, 8, 10, 120, 'پرس پا دستگاه'),
    ex('goblet-squat', 3, 10, 12, 90, 'گابلت اسکوات با دمبل'),
    ex('leg-curl', 3, 10, 12, 75, 'پشت پا دستگاه'),
    ex('standing-calf-raise', 4, 12, 15, 60, 'ساق پا ایستاده'),
    ex('plank', 3, 45, 60, 60, 'پلانک روی ساعد'),
  ];

  return [
    {
      id: 'template-ppl-1',
      name: 'روز ۱: پوش (سینه، سرشانه و پشت‌بازو)',
      dayLabel: 'روز ۰۱',
      focus: 'سینه · دلتوئید قدامی و میانی · پشت بازو',
      durationMinutes: estimateMinutes(push),
      description: 'تمرکز روی حرکات پرسی و فشاری بالاتنه.',
      exercises: push,
    },
    {
      id: 'template-ppl-2',
      name: 'روز ۲: پول (زیربغل و جلوبازو)',
      dayLabel: 'روز ۰۲',
      focus: 'عضلات پشت · دلتوئید خلفی · جلو بازو · ساعد',
      durationMinutes: estimateMinutes(pull),
      description: 'حرکات کششی بالاتنه با بارفیکس، هالتر خم و بازوها.',
      exercises: pull,
    },
    {
      id: 'template-ppl-3',
      name: 'روز ۳: لگز (پا، ساق و شکم)',
      dayLabel: 'روز ۰۳',
      focus: 'چهارسر · همسترینگ · سرینی · ساق · شکم',
      durationMinutes: estimateMinutes(legs),
      description: 'اسکوات، ددلیفت رومانیایی و تقویت کامل پایین‌تنه.',
      exercises: legs,
    },
    {
      id: 'template-ppl-4',
      name: 'روز ۴: بالاتنه ترکیبی',
      dayLabel: 'روز ۰۴',
      focus: 'سینه · پشت · سرشانه · دست‌ها',
      durationMinutes: estimateMinutes(upper),
      description: 'تقویت مجدد عضلات بالاتنه با حجم متوازن.',
      exercises: upper,
    },
    {
      id: 'template-ppl-5',
      name: 'روز ۵: پایین‌تنه و میان‌تنه',
      dayLabel: 'روز ۰۵',
      focus: 'چهارسر · همسترینگ · ساق · پلانک و شکم',
      durationMinutes: estimateMinutes(lower),
      description: 'تمرین دوم پایین‌تنه با تأکید بر استقامت و پایداری میان‌تنه.',
      exercises: lower,
    },
  ];
}

/** Converts workout templates into coach ProgramDay format */
function templatesToProgramDays(templates: WorkoutTemplate[]): ProgramDay[] {
  return templates.map((day) => ({
    name: day.name,
    exercises: day.exercises.map((item) => ({
      exerciseId: item.exerciseId,
      name: item.name,
      muscle: day.focus.split('·')[0]?.trim() || 'عمومی',
      sets: item.prescription.sets,
      reps: item.prescription.minReps === item.prescription.maxReps
        ? String(item.prescription.minReps)
        : `${item.prescription.minReps}-${item.prescription.maxReps}`,
      restSeconds: item.prescription.restSeconds,
    })),
  }));
}

export const presetTemplates: PresetTemplate[] = [
  {
    id: 'fullbody-3day',
    title: 'برنامهٔ ۳ روزه فول بادی (Full Body)',
    tagline: 'مناسب شروع، بازگشت به تمرین یا زمان محدود',
    badge: '۳ روز در هفته',
    description: 'تمرین تمام عضلات در هر جلسه با فاصلهٔ ریکاوری یک روز در میان. بسیار متوازن و کارآمد.',
    daysCount: 3,
    exercisesCount: 15,
    buildWorkoutTemplates: buildFullBodyTemplates,
    buildProgramDays: () => templatesToProgramDays(buildFullBodyTemplates()),
  },
  {
    id: 'upper-lower-4day',
    title: 'برنامهٔ ۴ روزه بالاتنه / پایین‌تنه (Upper / Lower)',
    tagline: 'بهترین تقسیم‌بندی برای رشد حجم و افزایش قدرت',
    badge: '۴ روز در هفته',
    description: 'دو جلسه مجزا برای بالاتنه و دو جلسه برای پایین‌تنه. تفکیک عالی روزهای قدرتی و هایپرتروفی.',
    daysCount: 4,
    exercisesCount: 22,
    buildWorkoutTemplates: buildUpperLowerTemplates,
    buildProgramDays: () => templatesToProgramDays(buildUpperLowerTemplates()),
  },
  {
    id: 'ppl-5day',
    title: 'برنامهٔ ۵ روزه تفکیکی (Push / Pull / Legs)',
    tagline: 'تفکیک عضلانی حرفه‌ای و حجم تمرینی بالا',
    badge: '۵ روز در هفته',
    description: 'تقسیم حرکات فشاری، کششی و پا به همراه دو جلسه مکمل بالاتنه و پایین‌تنه برای پیشرفته‌ها.',
    daysCount: 5,
    exercisesCount: 28,
    buildWorkoutTemplates: buildPplTemplates,
    buildProgramDays: () => templatesToProgramDays(buildPplTemplates()),
  },
  {
    id: 'rage-6day',
    title: 'برنامهٔ ۶ روزه قدرتی کلاسیک RAGE',
    tagline: 'برنامهٔ پیش‌فرض و جامع میتی با دوره‌های سنگین و سبک',
    badge: '۶ روز در هفته',
    description: 'برنامهٔ ۶ روزهٔ کامل با روزهای تمرکز سینه، پشت، پا، ساق، شکم و کاردیوی پایانی استاندارد.',
    daysCount: 6,
    exercisesCount: 42,
    buildWorkoutTemplates: () => structuredClone(originalRageProgram),
    buildProgramDays: () => templatesToProgramDays(originalRageProgram),
  },
  {
    id: 'blank',
    title: 'برنامهٔ جدید از صفر (خالی)',
    tagline: 'طراحی کاملاً شخصی‌سازی‌شده مطابق سلیقهٔ شما',
    badge: 'سفارشی',
    description: 'یک برنامه با روزهای اولیه و کاملاً خالی، بدون هیچ حرکت پیش‌فرضی برای افزودن آزادانهٔ حرکت‌های دلخواه شما.',
    daysCount: 1,
    exercisesCount: 0,
    buildWorkoutTemplates: () => [
      {
        id: `custom-day-${Date.now().toString(36)}`,
        name: 'روز ۱: شروع برنامه',
        dayLabel: 'روز ۰۱',
        focus: 'عضلات هدف',
        durationMinutes: 0,
        description: 'روز اول برنامهٔ تمرینی شخصی شما.',
        exercises: [],
      },
    ],
    buildProgramDays: () => [
      toProgramDay('روز ۱', []),
    ],
  },
];
