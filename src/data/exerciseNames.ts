/**
 * Movement names only. The card on the dashboard and the progression advice just
 * need to label a movement, so they read this small map instead of the full
 * catalogue in `exercises.ts` — that file carries every setup, cue and mistake
 * and is loaded together with the exercise routes. `exerciseNames.test.ts` keeps
 * this list identical to the catalogue.
 */
export const exerciseNames: Record<string, string> = {
  'barbell-bench-press': 'پرس سینه با هالتر',
  'incline-dumbbell-press': 'پرس بالاسینه با دمبل',
  'shoulder-press': 'پرس سرشانهٔ نشسته با دمبل',
  'cable-fly': 'قفسهٔ سینه با سیم‌کش',
  'lateral-raise': 'نشر جانب دمبل',
  'cable-lateral-raise': 'نشر جانب تک‌دست با سیم‌کش',
  'cable-triceps-pushdown': 'پشت بازو سیم‌کش با میله',
  'overhead-cable-triceps-extension': 'پشت بازو سیم‌کش بالای سر',
  'lat-pulldown': 'زیر بغل سیم‌کش از بالا',
  'neutral-grip-lat-pulldown': 'زیر بغل سیم‌کش با دستگیرهٔ موازی',
  'seated-cable-row': 'قایقی سیم‌کش نشسته',
  'one-arm-dumbbell-row': 'قایقی تک‌دست با دمبل',
  'face-pull': 'کشیدن طناب به سمت صورت',
  'reverse-fly': 'فلای معکوس دستگاه',
  'barbell-curl': 'جلو بازو با هالتر',
  'incline-dumbbell-curl': 'جلو بازو دمبل روی میز شیب‌دار',
  'cable-curl': 'جلو بازو سیم‌کش',
  'hammer-curl': 'جلو بازو چکشی با دمبل',
  'dumbbell-biceps-curl': 'جلو بازو با دمبل',
  'barbell-squat': 'اسکوات پشت با هالتر',
  'romanian-deadlift': 'ددلیفت رومانیایی',
  'leg-press': 'پرس پا دستگاه',
  'leg-extension': 'جلو پا دستگاه',
  'leg-curl': 'پشت پا نشسته',
  'standing-calf-raise': 'ساق پا ایستاده',
  'seated-calf-raise': 'ساق پا نشسته',
  'cable-crunch': 'کرانچ زانو‌زده با سیم‌کش',
  'incline-barbell-press': 'پرس بالاسینه با هالتر',
  'machine-chest-press': 'پرس سینه دستگاه',
  'machine-row': 'قایقی دستگاه با تکیه‌گاه سینه',
  'rope-triceps-pushdown': 'پشت بازو سیم‌کش با طناب',
  'bulgarian-split-squat': 'اسکوات بلغاری',
  'hanging-leg-raise': 'بالاآوردن زانو یا پا در حالت آویزان',
};

export const exerciseName = (id: string) => exerciseNames[id] ?? 'حرکت';
