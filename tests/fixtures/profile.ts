import type { NutritionGoals, UserProfile } from '../../src/types';

// Synthetic values used only by tests; they are not bundled with the application.
export const sampleProfile: UserProfile = {
  age: 28, sex: 'زن', heightCm: 168, weightKg: 64,
  primaryGoal: 'بهبود آمادگی', secondaryGoal: '', trainingExperience: 'تازه‌کار',
  trainingDays: 3, sessionMinutes: 45, dailyActivity: 'فعالیت سبک', sleepHours: '۷ ساعت',
  stressLevel: 2, injuries: '', equipment: 'باشگاه', workingWeightReferences: [],
};
export const sampleNutritionGoals: NutritionGoals = { proteinG: 100 };
