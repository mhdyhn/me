import type { NutritionGoals, UserProfile } from '../types';

/** Empty values mean that the account has not provided these details. */
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

export const blankNutritionGoals: NutritionGoals = { proteinG: 0 };

/** Keep saved personal text intact; only translate generic legacy gender labels. */
export const localizeKnownProfileCopy = (profile: UserProfile): UserProfile => {
  const sexLabels: Record<string, string> = {
    Male: 'مرد',
    Female: 'زن',
    'Prefer not to say': 'ترجیح می‌دهم نگویم',
  };
  // Fill only absent legacy fields for display; stored data is not changed until the user saves.
  const result = { ...profile } as UserProfile;
  for (const key of Object.keys(blankProfile) as (keyof UserProfile)[]) {
    if (result[key] === undefined) Object.assign(result, { [key]: structuredClone(blankProfile[key]) });
  }
  return { ...result, sex: sexLabels[result.sex] ?? result.sex };
};
