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

/** True when this account stored something of its own in the profile. */
export function hasProfileContent(profile: UserProfile): boolean {
  return (Object.keys(blankProfile) as (keyof UserProfile)[]).some((key) => {
    if (key === 'workingWeightReferences') return Array.isArray(profile.workingWeightReferences) && profile.workingWeightReferences.length > 0;
    const value = profile[key];
    if (typeof blankProfile[key] === 'number') return Number(value) !== 0;
    return String(value ?? '').trim() !== '';
  });
}

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
