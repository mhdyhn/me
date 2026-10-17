import type { WorkoutExercise, WorkoutTemplate } from '../types';

const exercise = (exerciseId: string, name: string, sets: number, minReps: number, maxReps: number, restSeconds = 75, note?: string): WorkoutExercise => ({
  exerciseId: `admin-${exerciseId}`,
  name,
  prescription: { sets, minReps, maxReps, restSeconds, targetRirLabel: '۱–۲', minimumRir: 1, ...(note ? { note } : {}) },
});

const day = (id: string, dayLabel: string, name: string, focus: string, exercises: WorkoutExercise[]): WorkoutTemplate => ({
  id: `admin-${id}`, dayLabel, name, focus, exercises,
  durationMinutes: Math.round(exercises.reduce((sum, item) => sum + item.prescription.sets * (item.prescription.restSeconds + 40), 0) / 60) + 8,
  description: `${focus}. گرم‌کردن ۸ تا ۱۰ دقیقه: ۵ دقیقه دوچرخه یا تردمیل، چرخش شانه و لگن، سپس ۱ تا ۲ ست سبک از حرکت اول. حرکت‌ها را به‌ترتیب همین جلسه انجام بده و بین ست‌ها طبق زمان استراحت برنامه مکث کن.`,
});

/** Personal five-day programme for the admin account only. */
export const adminPersonalProgram: WorkoutTemplate[] = [
  day('saturday', 'شنبه', 'شنبه: سینه، سرشانه و سه‌سر', 'سینه · سرشانه · سه‌سر', [
    exercise('incline-machine-press', 'پرس بالاسینه دستگاه یا دمبل', 3, 8, 10, 150),
    exercise('chest-press', 'پرس سینه دستگاه', 3, 10, 10, 120),
    exercise('pec-deck', 'فلای دستگاه (پک‌دک)', 3, 12, 12),
    exercise('machine-shoulder-press', 'پرس سرشانه دستگاه', 3, 10, 10, 120),
    exercise('lateral-raise', 'نشر جانب دستگاه یا کابل', 3, 12, 15),
    exercise('triceps-pushdown', 'سه‌سر کابل (پوش‌داون)', 3, 10, 12),
    exercise('overhead-triceps', 'سه‌سر بالای سر با کابل', 3, 12, 12),
  ]),
  day('sunday', 'یکشنبه', 'یکشنبه: پشت، دوسر و ساعد', 'پشت · دوسر · ساعد', [
    exercise('lat-pulldown', 'لت‌پول‌داون', 3, 8, 10, 120),
    exercise('seated-row', 'روئینگ نشسته دستگاه', 3, 10, 10, 120),
    exercise('tbar-row', 'روئینگ تی‌بار یا دستگاه', 2, 10, 10, 120),
    exercise('cable-pullover', 'پولاور کابل', 3, 12, 12),
    exercise('preacher-curl', 'دوسر دستگاه (پریچر)', 3, 10, 10),
    exercise('hammer-curl', 'دوسر چکشی کابل یا دمبل', 3, 12, 12),
    exercise('reverse-curl', 'ساعد (رورس کرل)', 3, 12, 15),
  ]),
  day('monday', 'دوشنبه', 'دوشنبه: پا، کمر پایین و شکم', 'پا · کمر پایین · شکم', [
    exercise('leg-press', 'لگ‌پرس', 4, 10, 10, 150),
    exercise('leg-extension', 'جلوپا دستگاه', 3, 12, 12, 75),
    exercise('leg-curl', 'پشت‌پا خوابیده یا نشسته', 3, 10, 12, 75),
    exercise('hack-squat', 'هاک‌اسکوات یا اسمیت اسکوات', 3, 10, 10, 150),
    exercise('standing-calf-raise', 'ساق ایستاده', 4, 12, 15, 75),
    exercise('back-extension', 'هایپراکستنشن (کمر پایین و سرینی)', 3, 12, 12, 75),
    exercise('hanging-leg-raise', 'بالا‌آوردن پا (آویزان)', 3, 10, 15, 75),
    exercise('cable-woodchop', 'وودچاپ کابل (مایل‌ها)', 3, 12, 12, 60, 'برای هر طرف.'),
  ]),
  day('wednesday', 'چهارشنبه', 'چهارشنبه: بالاتنه', 'بالاتنه', [
    exercise('neutral-pulldown', 'لت‌پول‌داون دست نزدیک یا خنثی', 2, 10, 10, 120),
    exercise('one-arm-row', 'روئینگ تک‌دست دمبل یا دستگاه', 3, 10, 10, 120),
    exercise('incline-press', 'پرس بالاسینه دمبل یا اسمیت', 3, 10, 10, 120),
    exercise('face-pull', 'فیس‌پول کابل یا فلای معکوس دستگاه', 3, 15, 15, 75),
    exercise('single-arm-lateral', 'نشر جانب کابل تک‌دست', 2, 15, 15, 75),
    exercise('cable-curl', 'دوسر کابل', 3, 12, 12, 75),
    exercise('machine-dip', 'سه‌سر دستگاه (دیپ)', 3, 10, 10, 120),
    exercise('shrug', 'شراگ دستگاه', 3, 12, 12, 75),
  ]),
  day('thursday', 'پنجشنبه', 'پنجشنبه: پا، سرشانه و شکم', 'پا · سرشانه · شکم', [
    exercise('smith-squat', 'اسکوات اسمیت یا هاک', 4, 8, 10, 150),
    exercise('lunge', 'لانج دمبل یا پرس پا تک‌پا', 3, 10, 10, 120),
    exercise('seated-leg-curl', 'پشت‌پا نشسته', 3, 12, 12, 75),
    exercise('seated-calf-raise', 'ساق نشسته', 4, 15, 15, 75),
    exercise('dumbbell-lateral', 'نشر جانب دمبل یا دستگاه', 3, 12, 15, 75),
    exercise('rear-delt-fly', 'نشر خم برای سرشانه خلفی', 2, 15, 15, 75),
    exercise('reverse-crunch', 'کرانچ معکوس روی نیمکت (پایین‌شکم)', 3, 12, 12, 75),
    exercise('woodchop', 'وودچاپ کابل', 3, 12, 12, 60, 'برای هر طرف.'),
    exercise('plank', 'پلانک', 2, 40, 60, 60, 'مدت هر ست بر حسب ثانیه.'),
  ]),
];

export const adminProgramGuidelines = [
  'سه‌شنبه استراحت؛ جمعه والیبال.',
  'تمپو: پایین‌آوردن ۲ تا ۳ ثانیه و بالا‌بردن ۱ تا ۲ ثانیه؛ بدون تکان‌دادن بدن.',
  'استراحت حرکات سنگین ۲ تا ۳ دقیقه و حرکات ایزوله ۶۰ تا ۹۰ ثانیه.',
  'وزنی انتخاب کن که ست آخر را با ۱ تا ۲ تکرار ذخیره تمام کنی؛ دو هفتهٔ اول وزن‌ها را پیدا و ثبت کن.',
  'وقتی همهٔ ست‌ها به بالای بازهٔ تکرار رسیدند، هفتهٔ بعد وزنه را ۲٫۵ تا ۵٪ زیاد کن.',
  'دو هفتهٔ اول از هر حرکت یک ست کمتر بزن تا بدن به تمرین برگردد.',
  'هر ۵ یا ۶ هفته یک هفته دیلود: نصف ست‌ها و ۱۰ تا ۲۰٪ کاهش وزنه.',
  'پروتئین روزانه ۱٫۶ تا ۲٫۲ گرم به‌ازای هر کیلو وزن بدن (برای ۷۷ کیلو: حدود ۱۲۵ تا ۱۷۰ گرم).',
  'مازاد کالری حدود ۳۰۰ کیلوکالری و خواب ۷ تا ۸ ساعت.',
];
