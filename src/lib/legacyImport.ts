import Dexie from 'dexie';
import { LEGACY_DB_NAME } from './accountScope';
import { db, MeetyDatabase } from './db';
import { notifyPersonalDataApplied, notifyPersonalDataChanged } from './personalSyncEvents';
import type { PersonalKind } from '../../shared/personalData';
import { defaultProfile, defaultNutritionGoals } from '../data/profile';
import { adminPersonalProgram } from '../data/adminProgram';

const legacyHealth = ['meety_ai_health_metrics_v1', 'meety_ai_joint_status_v1', 'meety_ai_mindful_logs_v1'];
const prefs = ['profile', 'nutritionGoals', 'programTemplates'];

/** Explicit user-confirmed import: never delete the old database or replace a destination record. */
export async function importLegacyOwnerData(includeOwnerDatabase = true): Promise<{ imported: number; skipped: number }> {
  if (db.name === LEGACY_DB_NAME) throw new Error('در نسخهٔ آفلاین همان پایگاه قدیمی باز است؛ وارد حساب وب شوید.');
  let imported = 0; let skipped = 0;
  const fallbackPrefs = { profile: defaultProfile, nutritionGoals: defaultNutritionGoals, programTemplates: adminPersonalProgram };
  let legacyPreferences: { key: string; value: unknown }[] = [];
  if (includeOwnerDatabase && await Dexie.exists(LEGACY_DB_NAME)) {
    const legacy = new MeetyDatabase(LEGACY_DB_NAME);
    try {
      const [sessions, weights, days, preferences] = await Promise.all([
        legacy.sessions.toArray(), legacy.bodyweights.toArray(), legacy.nutritionDays.toArray(), legacy.preferences.bulkGet(prefs),
      ]);
      legacyPreferences = preferences.filter((item): item is { key: string; value: unknown } => Boolean(item));
      await db.transaction('rw', db.sessions, db.bodyweights, db.nutritionDays, db.preferences, db.syncDeleted, async () => {
        for (const item of sessions) {
          if (await db.sessions.get(item.id) || await db.syncDeleted.get(`session:${item.id}`)) { skipped++; continue; }
          await db.sessions.put(item); imported++;
        }
        for (const item of weights) {
          if (await db.bodyweights.get(item.id) || await db.syncDeleted.get(`bodyweight:${item.id}`)) { skipped++; continue; }
          await db.bodyweights.put(item); imported++;
        }
        for (const item of days) {
          if (await db.nutritionDays.get(item.id) || await db.syncDeleted.get(`nutritionDay:${item.id}`)) { skipped++; continue; }
          await db.nutritionDays.put(item); imported++;
        }
      });
    } finally { legacy.close(); }
  }
  if (includeOwnerDatabase) {
    // Older builds displayed packaged defaults without ever writing them to IndexedDB.
    // Import those only after the user confirms that the old owner data is theirs.
    await db.transaction('rw', db.preferences, async () => {
      for (const key of prefs) {
        if (await db.preferences.get(key)) { skipped++; continue; }
        const old = legacyPreferences.find((item) => item.key === key);
        await db.preferences.put(old ?? { key, value: fallbackPrefs[key as keyof typeof fallbackPrefs] });
        imported++;
      }
    });
  }
  for (const key of legacyHealth) {
    const target = `${db.name}:${key}`;
    const source = window.localStorage.getItem(`${LEGACY_DB_NAME}:${key}`) ?? window.localStorage.getItem(key);
    if (source === null) continue;
    if (window.localStorage.getItem(target) !== null) { skipped++; continue; }
    try { JSON.parse(source); window.localStorage.setItem(target, source); imported++; }
    catch { skipped++; }
  }
  notifyPersonalDataApplied();
  notifyPersonalDataChanged();
  return { imported, skipped };
}

export const personalKindLabel: Record<PersonalKind, string> = {
  session: 'جلسهٔ تمرین', bodyweight: 'ثبت وزن', nutritionDay: 'یادداشت تغذیه', profile: 'پروفایل',
  nutritionGoals: 'هدف تغذیه', program: 'برنامهٔ شخصی', healthMetrics: 'شاخص‌های سلامت', jointConcerns: 'مفاصل', mindfulLogs: 'یادداشت‌های خوراک',
};
