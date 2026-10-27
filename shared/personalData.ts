export const PERSONAL_KINDS = [
  'session', 'bodyweight', 'nutritionDay', 'profile', 'nutritionGoals',
  'program', 'healthMetrics', 'jointConcerns', 'mindfulLogs',
] as const;

export type PersonalKind = typeof PERSONAL_KINDS[number];

export interface PersonalRecord {
  kind: PersonalKind;
  key: string;
  version: number;
  deleted: boolean;
  value: unknown;
  updatedAt: string;
}

export interface PersonalChange {
  kind: PersonalKind;
  key: string;
  baseVersion: number;
  operationId: string;
  deleted: boolean;
  value: unknown;
}

export type PersonalChangeResult =
  | { kind: PersonalKind; key: string; status: 'saved' | 'conflict'; current: PersonalRecord | null }
  | { kind: PersonalKind; key: string; status: 'invalid'; message: string };
