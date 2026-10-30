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
  return { ...profile, sex: sexLabels[profile.sex] ?? profile.sex };
};
