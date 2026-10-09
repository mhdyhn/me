import type { WorkoutExercise, WorkoutTemplate } from '../types';

/*
 * The weekly programme from the RAGE sheet (days 1–3 and 5–7; day 4 is rest).
 * Notation: "5 × 3" means 5 reps for 3 sets; "10–8 × 3" means 10 down to 8 reps for 3 sets.
 * Items whose movement is in the 3D library reuse its exercise id; the rest keep their
 * own id and show the programme's name and notes without an animation.
 */

const prescription = (
  sets: number,
  minReps: number,
  maxReps: number,
  targetRirLabel: string,
  minimumRir: number,
  restSeconds: number,
  note?: string,
) => ({ sets, minReps, maxReps, targetRirLabel, minimumRir, restSeconds, note });

const item = (
  exerciseId: string,
  name: string,
  sets: number,
  minReps: number,
  maxReps: number,
  restSeconds: number,
  note?: string,
  targetRirLabel = '1–2',
  minimumRir = 1,
): WorkoutExercise => ({
  exerciseId,
  name,
  prescription: prescription(sets, minReps, maxReps, targetRirLabel, minimumRir, restSeconds, note),
});

const WARMUP = 'ابتدا با وزن سبک‌تر گرم کنید.';
const DROP = 'دراپ ست: آخرین ست را با وزن اصلی ۸ تا ۱۰ تکرار کنید، بلافاصله وزن را ۲۵٪ کم کنید (بدون استراحت) و ۵ تا ۹ تکرار دیگر تا نزدیک خستگی بزنید.';

const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const toPersianNumber = (value: number) => String(value).padStart(2, '0').split('').map((digit) => persianDigits[Number(digit)]).join('');

/** Rough session length: each set plus its rest, plus about 7 minutes of cardio. */
const estimateMinutes = (exercises: WorkoutExercise[]) =>
  Math.round(exercises.reduce((total, { prescription: p }) => total + p.sets * (p.restSeconds + 40), 0) / 60) + 7;

const day = (
  id: string,
  dayNumber: number,
  name: string,
  focus: string,
  cardio: string,
  exercises: WorkoutExercise[],
): WorkoutTemplate => ({
  id,
  name,
  dayLabel: `روز ${toPersianNumber(dayNumber)}`,
  focus,
  durationMinutes: estimateMinutes(exercises),
  description: `${focus}. کاردیوی پایانی: ${cardio}.`,
  exercises,
});

export const workoutTemplates: WorkoutTemplate[] = [
  day('day-1', 1, 'روز ۱: سینه و سرشانه', 'سینه · سرشانه · پشت بازو', 'Bike ۷ دقیقه، LISS سبک برای ریکاوری', [
    item('incline-barbell-press', 'پرس بالا سینه هالتر', 3, 5, 5, 150, WARMUP, '2', 2),
    item('flat-dumbbell-press', 'پرس سینه دمبل', 3, 5, 5, 150, WARMUP, '2', 2),
    item('decline-dumbbell-press', 'پرس زیر سینه دمبل', 3, 5, 5, 150, WARMUP, '2', 2),
    item('cable-shoulder-press', 'پرس سرشانه سیمکش', 3, 5, 5, 120, WARMUP, '2', 2),
    item('standing-barbell-press', 'پرس سرشانه هالتر', 3, 5, 5, 150, WARMUP, '2', 2),
    item('cable-lateral-raise', 'نشر جانب تک دست سیمکش', 3, 8, 10, 90),
    item('overhead-cable-triceps-extension', 'پشت بازو بالای سر سیمکش', 3, 8, 10, 90, DROP),
    item('cable-triceps-single-arm', 'پشت بازو سیمکش تک دست', 3, 8, 10, 90),
  ]),
  day('day-2', 2, 'روز ۲: پشت و جلو بازو', 'پشت · جلو بازو · ساعد', 'Elliptical ۷ دقیقه، LISS سبک برای ریکاوری', [
    item('reverse-grip-lat-pulldown', 'زیربغل سیمکش مچ برعکس', 3, 5, 5, 150, WARMUP, '2', 2),
    item('barbell-bent-over-row', 'زیربغل هالتر خم', 3, 5, 5, 150, WARMUP, '2', 2),
    item('sumo-deadlift', 'دددلیفت سومو', 3, 5, 5, 210, WARMUP, '2', 2),
    item('ez-bar-curl', 'جلو بازو هالتر EZ', 3, 8, 10, 90, 'فشار کمتری روی مچ نسبت به هالتر معمولی وارد می‌کند.'),
    item('hammer-curl', 'جلو بازو چکشی', 3, 8, 10, 90, 'بازوبراکیالیس و ساعد را هم درگیر می‌کند.'),
    item('dead-hang', 'آویزان ماندن از بارفیکس', 3, 20, 60, 90, 'مدت هر ست بر حسب ثانیه: ۲۰ تا ۶۰ ثانیه آویزان بمانید.'),
  ]),
  day('day-3', 3, 'روز ۳: پا، ساق و شکم', 'چهارسر ران · همسترینگ · ساق · شکم', 'Bike ۷ دقیقه، با شدت بسیار پایین برای خنک‌سازی بعد از روز پا', [
    item('bodyweight-squat', 'اسکوات وزن بدن', 4, 5, 6, 120, undefined, '2', 2),
    item('single-leg-cable-rdl', 'دددلیفت رومانیایی تک پا با سیمکش', 4, 5, 5, 120, WARMUP, '2', 2),
    item('leg-extension', 'جلو پا دستگاه', 4, 8, 10, 90, 'فشار روی تاندون پاتلا را کنترل کنید؛ با وزن سبک شروع کنید.'),
    item('standing-calf-raise', 'ساق پا هالتر ایستاده', 3, 8, 10, 90),
    item('machine-crunch', 'شکم کرانچ دستگاه', 3, 8, 10, 90),
    item('hollow-hold', 'هالو هولد', 3, 20, 30, 90, 'کمر به زمین، دست‌ها بالای سر، پاها کمی بالاتر از زمین.'),
  ]),
  day('day-5', 5, 'روز ۵: سینه، سرشانه و پشت بازو', 'سینه · سرشانه · پشت بازو', 'Bike ۷ دقیقه، LISS سبک برای ریکاوری', [
    item('incline-dumbbell-press', 'پرس بالا سینه دمبل', 3, 5, 5, 150, WARMUP, '2', 2),
    item('swedish-dip', 'شنا سوئدی', 3, 8, 10, 120),
    item('decline-dumbbell-press', 'پرس زیر سینه دمبل', 3, 5, 5, 150, WARMUP, '2', 2),
    item('smith-shoulder-press', 'پرس سرشانه اسمیت', 3, 5, 5, 120, WARMUP, '2', 2),
    item('shoulder-press', 'پرس سرشانه دمبل نشسته', 3, 5, 5, 120, WARMUP, '2', 2),
    item('machine-lateral-raise', 'نشر جانب دستگاه', 3, 8, 10, 90),
    item('two-hand-dumbbell-overhead-triceps', 'پشت بازو بالای سر دمبل دو دست', 3, 8, 10, 90),
    item('machine-triceps-extension', 'پشت بازو دستگاه', 3, 8, 10, 90, DROP),
  ]),
  day('day-6', 6, 'روز ۶: پشت و جلو بازو', 'پشت · جلو بازو · ساعد', 'Elliptical ۷ دقیقه، LISS سبک برای ریکاوری', [
    item('parallel-grip-pull-up', 'بارفیکس دسته موازی', 3, 6, 8, 150, 'مناسب‌ترین حالت برای مفصل آرنج.', '2', 2),
    item('close-grip-cable-row', 'قایقی سیمکش دست جمع', 3, 5, 5, 150, WARMUP, '2', 2),
    item('sumo-deadlift', 'دددلیفت سومو', 3, 5, 5, 210, WARMUP, '2', 2),
    item('close-grip-barbell-curl', 'جلو بازو هالتر دست جمع', 3, 8, 10, 90, 'سر بلند جلو بازو را بیشتر درگیر می‌کند.'),
    item('crossbody-hammer-curl', 'جلو بازو چکشی ضربدری', 3, 8, 10, 90),
    item('dead-hang', 'آویزان ماندن از بارفیکس', 3, 20, 60, 90, 'مدت هر ست بر حسب ثانیه: ۲۰ تا ۶۰ ثانیه آویزان بمانید.'),
  ]),
  day('day-7', 7, 'روز ۷: پا، ساق و شکم', 'چهارسر ران · همسترینگ · ساق · شکم', 'Bike ۷ دقیقه، با شدت بسیار پایین برای خنک‌سازی بعد از روز پا', [
    item('barbell-squat', 'اسکوات هالتر', 4, 5, 5, 210, WARMUP, '2', 2),
    item('single-leg-cable-rdl', 'دددلیفت رومانیایی تک پا سیمکش', 4, 5, 5, 120, WARMUP, '2', 2),
    item('leg-extension', 'جلو پا دستگاه', 4, 8, 10, 90, 'فشار روی تاندون پاتلا را کنترل کنید؛ با وزن سبک شروع کنید.'),
    item('standing-calf-raise', 'ساق پا هالتر ایستاده', 3, 8, 10, 90),
    item('machine-crunch', 'شکم کرانچ', 3, 8, 10, 90),
    item('hollow-hold', 'هالو هولد', 3, 20, 30, 90, 'کمر به زمین، دست‌ها بالای سر، پاها کمی بالاتر از زمین.'),
  ]),
];

export const primaryWorkoutTemplates = workoutTemplates.filter((workout) => !workout.optional);
export const getWorkoutTemplate = (id: string) => workoutTemplates.find((workout) => workout.id === id);

/** Programme name for an exercise id, used where a session has no catalogue entry to read from. */
export const programExerciseName = (exerciseId: string) =>
  workoutTemplates.flatMap((workout) => workout.exercises).find((item) => item.exerciseId === exerciseId)?.name;
