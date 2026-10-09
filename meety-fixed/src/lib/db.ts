import Dexie, { type Table } from 'dexie';
import type { BodyweightEntry, NutritionDay, PreferenceRecord, WorkoutSession } from '../types';

class MeetyDatabase extends Dexie {
  sessions!: Table<WorkoutSession, string>;
  bodyweights!: Table<BodyweightEntry, string>;
  nutritionDays!: Table<NutritionDay, string>;
  preferences!: Table<PreferenceRecord, string>;

  constructor() {
    super('meety-personal-coach');
    this.version(1).stores({
      sessions: 'id, templateId, startedAt, completedAt, status',
      bodyweights: 'id, date',
      nutritionDays: 'id, date',
      preferences: 'key',
    });
  }
}

export const db = new MeetyDatabase();
