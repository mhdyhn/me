import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_DB_NAME } from './accountScope';
import type { MeetyDatabase } from './db';

let db: MeetyDatabase;
let Database: typeof MeetyDatabase;
let importLegacyOwnerData: typeof import('./legacyImport').importLegacyOwnerData;
beforeAll(async () => {
  window.localStorage.setItem('meety.account-scope', 'user-88');
  const database = await import('./db');
  db = database.db; Database = database.MeetyDatabase;
  importLegacyOwnerData = (await import('./legacyImport')).importLegacyOwnerData;
});

let legacy: MeetyDatabase;
beforeEach(async () => {
  window.localStorage.clear();
  await Promise.all([db.sessions.clear(), db.bodyweights.clear(), db.nutritionDays.clear(), db.preferences.clear(), db.syncDeleted.clear()]);
  legacy = new Database(LEGACY_DB_NAME);
});
afterEach(async () => { legacy.close(); await legacy.delete(); window.localStorage.clear(); });

describe('confirmed legacy import', () => {
  it('preserves old data, existing destination records and deletion markers', async () => {
    await legacy.bodyweights.bulkPut([
      { id: 'old-a', date: '2026-10-01', weightKg: 70 },
      { id: 'old-b', date: '2026-10-02', weightKg: 71 },
    ]);
    await legacy.preferences.put({ key: 'profile', value: { age: 40 } });
    await db.preferences.put({ key: 'profile', value: { age: 50 } });
    await db.syncDeleted.put({ id: 'bodyweight:old-b', kind: 'bodyweight', key: 'old-b' });
    localStorage.setItem('meety_ai_joint_status_v1', '["knees"]');
    await importLegacyOwnerData();
    expect(await db.bodyweights.get('old-a')).toMatchObject({ weightKg: 70 });
    expect(await db.bodyweights.get('old-b')).toBeUndefined();
    expect((await db.preferences.get('profile'))?.value).toEqual({ age: 50 });
    expect(await db.preferences.get('programTemplates')).toBeDefined(); // old builds may not have persisted their bundled default
    expect(localStorage.getItem(`${db.name}:meety_ai_joint_status_v1`)).toBe('["knees"]');
    expect(localStorage.getItem('meety_ai_joint_status_v1')).toBe('["knees"]');
    expect(await legacy.bodyweights.count()).toBe(2);
    expect((await legacy.preferences.get('profile'))?.value).toEqual({ age: 40 });
  });

  it('imports only shared legacy health for a non-admin, never the shared owner database', async () => {
    await legacy.bodyweights.put({ id: 'owner-weight', date: '2026-10-01', weightKg: 70 });
    localStorage.setItem('meety_ai_mindful_logs_v1', '[]');
    const result = await importLegacyOwnerData(false);
    expect(result.imported).toBe(1);
    expect(await db.bodyweights.count()).toBe(0);
    expect(await db.preferences.count()).toBe(0);
    expect(localStorage.getItem(`${db.name}:meety_ai_mindful_logs_v1`)).toBe('[]');
  });
});
