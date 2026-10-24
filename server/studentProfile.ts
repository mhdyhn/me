import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';

export interface StudentProfile {
  age: number;
  sex: string;
  heightCm: number;
  weightKg: number;
  primaryGoal: string;
  secondaryGoal: string;
  trainingExperience: string;
  trainingDays: number;
  sessionMinutes: number;
  dailyActivity: string;
  sleepHours: string;
  stressLevel: number;
  injuries: string;
  equipment: string;
  workingWeightReferences: { label: string; weightKg: number; note: string }[];
}

export interface StoredStudentProfile {
  profile: StudentProfile;
  shareWithCoach: boolean;
  updatedAt: string;
}

const stringValue = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const numberValue = (value: unknown, min: number, max: number): number => {
  const parsed = typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new HttpError(400, 'اطلاعات پروفایل معتبر نیست.');
  return parsed;
};

export async function migrateStudentProfiles(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS student_profiles (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      share_with_coach INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
}

export function validateStudentProfile(raw: unknown): StudentProfile {
  const input = requireObject(raw);
  const profile = (input.profile && typeof input.profile === 'object' ? input.profile : null) as Record<string, unknown> | null;
  if (!profile) throw new HttpError(400, 'پروفایل ارسال نشده است.');
  const references = Array.isArray(profile.workingWeightReferences) ? profile.workingWeightReferences.slice(0, 20) : [];
  return {
    age: numberValue(profile.age, 13, 100),
    sex: stringValue(profile.sex, 40),
    heightCm: numberValue(profile.heightCm, 100, 250),
    weightKg: numberValue(profile.weightKg, 30, 300),
    primaryGoal: stringValue(profile.primaryGoal, 120),
    secondaryGoal: stringValue(profile.secondaryGoal, 120),
    trainingExperience: stringValue(profile.trainingExperience, 160),
    trainingDays: numberValue(profile.trainingDays, 1, 7),
    sessionMinutes: numberValue(profile.sessionMinutes, 15, 240),
    dailyActivity: stringValue(profile.dailyActivity, 120),
    sleepHours: stringValue(profile.sleepHours, 60),
    stressLevel: numberValue(profile.stressLevel, 0, 10),
    injuries: stringValue(profile.injuries, 1000),
    equipment: stringValue(profile.equipment, 200),
    workingWeightReferences: references.map((rawReference) => {
      const reference = rawReference && typeof rawReference === 'object' ? rawReference as Record<string, unknown> : {};
      return {
        label: stringValue(reference.label, 100),
        weightKg: numberValue(reference.weightKg, 0, 1000),
        note: stringValue(reference.note, 300),
      };
    }),
  };
}

export async function saveStudentProfile(db: Db, studentId: number, profile: StudentProfile, shareWithCoach: boolean, at: string): Promise<StoredStudentProfile> {
  await db.query(
    `INSERT INTO student_profiles (student_id, body, share_with_coach, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id) DO UPDATE SET body = excluded.body, share_with_coach = excluded.share_with_coach, updated_at = excluded.updated_at`,
    [studentId, JSON.stringify(profile), shareWithCoach ? 1 : 0, at],
  );
  return { profile, shareWithCoach, updatedAt: at };
}

export async function setStudentProfileSharing(db: Db, studentId: number, shareWithCoach: boolean, at: string): Promise<boolean> {
  const rows = await db.query<{ student_id: number }>(
    'UPDATE student_profiles SET share_with_coach = $1, updated_at = $2 WHERE student_id = $3 RETURNING student_id',
    [shareWithCoach ? 1 : 0, at, studentId],
  );
  if (shareWithCoach && rows.length === 0) throw new HttpError(400, 'پروفایلی برای همگام‌سازی ثبت نشده است.');
  return rows.length > 0;
}

export async function loadStudentProfile(db: Db, studentId: number): Promise<StoredStudentProfile | null> {
  const row = (await db.query<{ body: string; share_with_coach: number; updated_at: string }>(
    'SELECT body, share_with_coach, updated_at FROM student_profiles WHERE student_id = $1', [studentId],
  ))[0];
  if (!row) return null;
  return { profile: JSON.parse(row.body) as StudentProfile, shareWithCoach: row.share_with_coach === 1, updatedAt: row.updated_at };
}
