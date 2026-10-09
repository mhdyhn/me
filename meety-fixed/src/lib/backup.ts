import { db } from './db';
import { defaultNutritionGoals, defaultProfile } from '../data/profile';
import type { BodyweightEntry, NutritionDay, NutritionGoals, PreferenceRecord, UserProfile, WorkoutSession } from '../types';

export interface BackupPayload {
  app: 'Meety';
  schemaVersion: 2;
  exportedAt: string;
  profile: UserProfile;
  nutritionGoals: NutritionGoals;
  sessions: WorkoutSession[];
  bodyweights: BodyweightEntry[];
  nutritionDays: NutritionDay[];
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';

export function validateBackup(value: unknown): BackupPayload {
  if (!isObject(value) || value.app !== 'Meety') throw new Error('این فایل، پشتیبان معتبر میتی نیست.');
  if (!value.profile || !Array.isArray(value.sessions) || !Array.isArray(value.bodyweights) || !Array.isArray(value.nutritionDays)) {
    throw new Error('ساختار فایل پشتیبان ناقص است.');
  }
  return {
    app: 'Meety',
    schemaVersion: 2,
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : new Date().toISOString(),
    profile: value.profile as UserProfile,
    nutritionGoals: (value.nutritionGoals ?? { proteinG: 150 }) as NutritionGoals,
    sessions: value.sessions as WorkoutSession[],
    bodyweights: value.bodyweights as BodyweightEntry[],
    nutritionDays: value.nutritionDays as NutritionDay[],
  };
}

export async function readBackupFile(file: File): Promise<BackupPayload> {
  const raw = await file.text();
  return validateBackup(JSON.parse(raw));
}

export async function exportBackup(): Promise<Blob> {
  const [profile, nutritionGoals, sessions, bodyweights, nutritionDays] = await Promise.all([
    db.preferences.get('profile'),
    db.preferences.get('nutritionGoals'),
    db.sessions.toArray(),
    db.bodyweights.toArray(),
    db.nutritionDays.toArray(),
  ]);
  const payload: BackupPayload = {
    app: 'Meety',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    profile: (profile?.value as UserProfile | undefined) ?? defaultProfile,
    nutritionGoals: (nutritionGoals?.value as NutritionGoals | undefined) ?? defaultNutritionGoals,
    sessions,
    bodyweights,
    nutritionDays,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export async function importBackup(payload: BackupPayload, mode: 'replace' | 'merge') {
  await db.transaction('rw', db.sessions, db.bodyweights, db.nutritionDays, db.preferences, async () => {
    if (mode === 'replace') {
      await db.sessions.clear();
      await db.bodyweights.clear();
      await db.nutritionDays.clear();
      await db.preferences.clear();
    }
    const currentProfile = await db.preferences.get('profile');
    const currentGoals = await db.preferences.get('nutritionGoals');
    const preferenceRows: PreferenceRecord[] = mode === 'replace' || !currentProfile
      ? [{ key: 'profile', value: payload.profile }, { key: 'nutritionGoals', value: payload.nutritionGoals }]
      : currentGoals
        ? []
        : [{ key: 'nutritionGoals', value: payload.nutritionGoals }];
    if (preferenceRows.length) await db.preferences.bulkPut(preferenceRows);
    if (payload.sessions.length) await db.sessions.bulkPut(payload.sessions);
    if (payload.bodyweights.length) await db.bodyweights.bulkPut(payload.bodyweights);
    if (payload.nutritionDays.length) await db.nutritionDays.bulkPut(payload.nutritionDays);
    await db.preferences.put({ key: 'lastBackupAt', value: new Date().toISOString() });
  });
}
