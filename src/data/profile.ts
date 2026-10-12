import type { NutritionGoals, UserProfile } from '../types';

export const defaultProfile: UserProfile = {
  age: 24,
  sex: 'مرد',
  heightCm: 190,
  weightKg: 77,
  primaryGoal: 'افزایش تودهٔ عضلانی · هایپرتروفی · قدرت',
  secondaryGoal: 'رشد متعادل',
  trainingExperience: 'حدود ۱ سال سابقهٔ کلی، همراه با وقفه',
  trainingDays: 5,
  sessionMinutes: 90,
  dailyActivity: 'بیشتر روز پشت میز و کم‌تحرک',
  sleepHours: '۷ تا ۸ ساعت',
  stressLevel: 5,
  injuries: 'آسیب‌دیدگی یا محدودیت شناخته‌شده‌ای گزارش نشده است',
  equipment: 'باشگاه کامل: هالتر، دمبل، سیم‌کش، دستگاه‌ها، رک، نیمکت و تجهیزات پا',
  workingWeightReferences: [
    { label: 'پرس سینه', weightKg: 20, note: 'فقط برآورد وزنهٔ کاری؛ تعداد ست و تکرار تأیید نشده است.' },
    { label: 'اسکوات', weightKg: 30, note: 'فقط برآورد وزنهٔ کاری؛ تعداد ست و تکرار تأیید نشده است.' },
    { label: 'پرس سرشانه', weightKg: 10, note: 'برآورد وزنهٔ کاری؛ نوع حرکت و تعداد تکرار تأیید نشده است.' },
    { label: 'پرس پا', weightKg: 60, note: 'فقط برآورد وزنهٔ کاری؛ تعداد ست و تکرار تأیید نشده است.' },
    { label: 'جلو پا', weightKg: 100, note: 'برآورد وزنهٔ کاری؛ نوع دستگاه و تعداد تکرار تأیید نشده است.' },
    { label: 'جلو بازو', weightKg: 10, note: 'گزارش شده که حرکت دشوار بوده؛ نوع حرکت و تعداد تکرار مشخص نیست.' },
  ],
};

const legacyDefaultCopy: Partial<Record<keyof UserProfile, string>> = {
  primaryGoal: 'Muscle gain · hypertrophy · strength',
  secondaryGoal: 'Balanced development',
  trainingExperience: 'About 1 year total, with interruptions',
  dailyActivity: 'Mostly sedentary desk work',
  sleepHours: '7–8 hours',
  injuries: 'No current injuries or known limitations reported',
  equipment: 'Full gym: barbells, dumbbells, cables, machines, rack, benches and leg equipment',
};

const legacyReferences = [
  { label: 'Bench press', note: 'Working-weight reference; sets and reps not confirmed.' },
  { label: 'Squat', note: 'Working-weight reference; sets and reps not confirmed.' },
  { label: 'Shoulder press', note: 'Working-weight reference; variation and reps not confirmed.' },
  { label: 'Leg press', note: 'Working-weight reference; sets and reps not confirmed.' },
  { label: 'Leg extension', note: 'Working-weight reference; machine and reps not confirmed.' },
  { label: 'Biceps curl', note: 'Reported as difficult; variation and reps not confirmed.' },
];

/** Translate only known copy from earlier app versions; preserve anything the user wrote. */
export const localizeKnownProfileCopy = (profile: UserProfile): UserProfile => {
  const result = { ...profile };
  const sexLabels: Record<string, string> = {
    Male: 'مرد',
    Female: 'زن',
    'Prefer not to say': 'ترجیح می‌دهم نگویم',
  };
  result.sex = sexLabels[result.sex] ?? result.sex;

  (Object.keys(legacyDefaultCopy) as (keyof UserProfile)[]).forEach((key) => {
    const legacy = legacyDefaultCopy[key];
    if (legacy && result[key] === legacy) {
      (result as unknown as Record<keyof UserProfile, unknown>)[key] = defaultProfile[key];
    }
  });
  result.workingWeightReferences = result.workingWeightReferences.map((reference, index) => {
    const legacy = legacyReferences[index];
    const translated = defaultProfile.workingWeightReferences[index];
    if (!legacy || !translated) return reference;
    return {
      ...reference,
      label: reference.label === legacy.label ? translated.label : reference.label,
      note: reference.note === legacy.note ? translated.note : reference.note,
    };
  });
  return result;
};

export const defaultNutritionGoals: NutritionGoals = {
  proteinG: Math.round(77 * 1.95),
};

/** A blank profile for a new account: the developer's own details are never shown to anyone else. */
export const blankProfile: UserProfile = {
  age: 0,
  sex: '',
  heightCm: 0,
  weightKg: 0,
  primaryGoal: '',
  secondaryGoal: '',
  trainingExperience: '',
  trainingDays: 0,
  sessionMinutes: 0,
  dailyActivity: '',
  sleepHours: '',
  stressLevel: 0,
  injuries: '',
  equipment: '',
  workingWeightReferences: [],
};

export const blankNutritionGoals = Object.fromEntries(Object.keys(defaultNutritionGoals).map((key) => [key, 0])) as unknown as NutritionGoals;
