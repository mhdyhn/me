import Dexie, { type Table } from 'dexie';
import type { BodyweightEntry, NutritionDay, PreferenceRecord, WorkoutSession } from '../types';
import { personalDbName } from './accountScope';
import type { PersonalKind } from '../../shared/personalData';

export interface PersonalSyncMetadata {
  id: string; kind: PersonalKind; key: string; version: number; signature: string;
}

export class MeetyDatabase extends Dexie {
  sessions!: Table<WorkoutSession, string>;
  bodyweights!: Table<BodyweightEntry, string>;
  nutritionDays!: Table<NutritionDay, string>;
  preferences!: Table<PreferenceRecord, string>;
  syncMetadata!: Table<PersonalSyncMetadata, string>;
  syncDeleted!: Table<{ id: string; kind: PersonalKind; key: string }, string>;

  constructor(name = personalDbName()) {
    super(name);
    this.version(1).stores({
      sessions: 'id, templateId, startedAt, completedAt, status',
      bodyweights: 'id, date',
      nutritionDays: 'id, date',
      preferences: 'key',
    });
    this.version(2).stores({ syncMetadata: 'id' });
    this.version(3).stores({ syncDeleted: 'id' });
  }
}

export const db = new MeetyDatabase();
