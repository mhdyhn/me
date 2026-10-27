import type { Db } from './db.ts';
import { HttpError, requireObject } from './http.ts';

export type AiModuleKey = 'recovery' | 'muscles' | 'hinge' | 'noom';
export const ALL_AI_MODULES: AiModuleKey[] = ['recovery', 'muscles', 'hinge', 'noom'];

export type MaxHrMethod = 'tanaka' | 'fox' | 'custom';

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  persianName: string;
  minBpm: number;
  maxBpm: number;
  intensityPercent: string;
  purpose: string;
  color: string;
}

export interface StudentBiometrics {
  studentId: number;
  coachId: number;
  enabledModules: AiModuleKey[];
  age: number | null;
  restingHr: number | null;
  maxHr: number;
  maxHrMethod: MaxHrMethod;
  limitations: string;
  contraindicatedMovements: string[];
  zones: HeartRateZone[];
  updatedAt: string | null;
}

export async function migrateBiometrics(db: Db): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS student_biometrics (
      student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      coach_id INTEGER NOT NULL REFERENCES users(id),
      enabled_modules TEXT NOT NULL DEFAULT '["recovery","muscles","hinge","noom"]',
      age INTEGER,
      resting_hr INTEGER,
      max_hr INTEGER,
      max_hr_method TEXT NOT NULL DEFAULT 'tanaka',
      limitations TEXT NOT NULL DEFAULT '',
      contraindicated_movements TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_student_biometrics_coach_id ON student_biometrics(coach_id);
  `);
}

/**
 * Calculates Maximum Heart Rate (HR_max)
 * - Tanaka formula: 208 - (0.7 * age)
 * - Fox formula: 220 - age
 * - Custom / measured peak: coach entered value
 */
export function calculateMaxHeartRate(age: number | null | undefined, method: MaxHrMethod = 'tanaka', customMax?: number | null): number {
  if (method === 'custom' && customMax && customMax >= 100 && customMax <= 240) {
    return Math.round(customMax);
  }
  if (age && age >= 10 && age <= 100) {
    if (method === 'fox') {
      return Math.round(220 - age);
    }
    // Tanaka formula
    return Math.round(208 - 0.7 * age);
  }
  return 190;
}

/**
 * Computes the 5 Cardiovascular Target Training Zones
 * Uses Karvonen Heart Rate Reserve (HRR) formula if resting HR is available:
 * Target HR = ((HR_max - RHR) * % intensity) + RHR
 */
export function calculateHeartRateZones(maxHr: number, restingHr?: number | null): HeartRateZone[] {
  const hasRhr = restingHr && restingHr >= 35 && restingHr < maxHr;
  const hrr = hasRhr ? maxHr - restingHr : maxHr;

  const calcBpm = (pct: number): number => {
    if (hasRhr) {
      return Math.round(restingHr + pct * hrr);
    }
    return Math.round(pct * maxHr);
  };

  return [
    {
      zone: 1,
      name: 'Active Recovery',
      persianName: 'زون ۱: ریکاوری فعال و گرم‌کردن',
      minBpm: calcBpm(0.5),
      maxBpm: calcBpm(0.6),
      intensityPercent: '۵۰٪ تا ۶۰٪',
      purpose: 'تسریع جریان خون، پاکسازی اسید لاکتیک و آماده‌سازی سیستم عروقی و مفاصل',
      color: '#10b981',
    },
    {
      zone: 2,
      name: 'Aerobic Base',
      persianName: 'زون ۲: پایه هوازی و اکسیداسیون چربی',
      minBpm: calcBpm(0.6),
      maxBpm: calcBpm(0.7),
      intensityPercent: '۶۰٪ تا ۷۰٪',
      purpose: 'رشد میتوکندری، چربی‌سوزی پایدار، ارتقای ظرفیت قلبی بدون خستگی فرساینده',
      color: '#06b6d4',
    },
    {
      zone: 3,
      name: 'Aerobic Tempo',
      persianName: 'زون ۳: استقامت هوازی و تمپو',
      minBpm: calcBpm(0.7),
      maxBpm: calcBpm(0.8),
      intensityPercent: '۷۰٪ تا ۸۰٪',
      purpose: 'بهبود بازده تنفسی، استقامت عضلانی و ظرفیت جابه‌جایی اکسیژن',
      color: '#3b82f6',
    },
    {
      zone: 4,
      name: 'Lactate Threshold',
      persianName: 'زون ۴: آستانه بی‌هوازی و اسید لاکتیک',
      minBpm: calcBpm(0.8),
      maxBpm: calcBpm(0.9),
      intensityPercent: '۸۰٪ تا ۹۰٪',
      purpose: 'بالا بردن آستانه خستگی و توان ادامه فعالیت با غلظت بالای لاکتات خون',
      color: '#f59e0b',
    },
    {
      zone: 5,
      name: 'Neuromuscular & VO2 Max',
      persianName: 'زون ۵: اوج توان بی‌هوازی و حداکثر اکسیژن',
      minBpm: calcBpm(0.9),
      maxBpm: maxHr,
      intensityPercent: '۹۰٪ تا ۱۰۰٪',
      purpose: 'توان انفجاری عصبی-عضلانی و حداکثر نرخ مصرف اکسیژن در ست‌های سنگین و اینتروال‌ها',
      color: '#ef4444',
    },
  ];
}

export function defaultBiometrics(studentId: number, coachId = 0): StudentBiometrics {
  const maxHr = 190;
  return {
    studentId,
    coachId,
    enabledModules: [...ALL_AI_MODULES],
    age: null,
    restingHr: null,
    maxHr,
    maxHrMethod: 'tanaka',
    limitations: '',
    contraindicatedMovements: [],
    zones: calculateHeartRateZones(maxHr, null),
    updatedAt: null,
  };
}

export async function loadBiometrics(db: Db, studentId: number): Promise<StudentBiometrics> {
  const row = (
    await db.query<{
      student_id: number;
      coach_id: number;
      enabled_modules: string;
      age: number | null;
      resting_hr: number | null;
      max_hr: number | null;
      max_hr_method: string;
      limitations: string;
      contraindicated_movements: string;
      updated_at: string;
    }>('SELECT * FROM student_biometrics WHERE student_id = $1', [studentId])
  )[0];

  if (!row) {
    return defaultBiometrics(studentId);
  }

  let enabledModules: AiModuleKey[] = [...ALL_AI_MODULES];
  try {
    const parsed = JSON.parse(row.enabled_modules);
    if (Array.isArray(parsed)) {
      enabledModules = parsed.filter((m): m is AiModuleKey => ALL_AI_MODULES.includes(m));
    }
  } catch {}

  let contraindicatedMovements: string[] = [];
  try {
    const parsed = JSON.parse(row.contraindicated_movements);
    if (Array.isArray(parsed)) contraindicatedMovements = parsed;
  } catch {}

  const method = (row.max_hr_method === 'fox' || row.max_hr_method === 'custom' ? row.max_hr_method : 'tanaka') as MaxHrMethod;
  const maxHr = row.max_hr ?? calculateMaxHeartRate(row.age, method);
  const zones = calculateHeartRateZones(maxHr, row.resting_hr);

  return {
    studentId: Number(row.student_id),
    coachId: Number(row.coach_id),
    enabledModules,
    age: row.age ? Number(row.age) : null,
    restingHr: row.resting_hr ? Number(row.resting_hr) : null,
    maxHr,
    maxHrMethod: method,
    limitations: row.limitations || '',
    contraindicatedMovements,
    zones,
    updatedAt: row.updated_at,
  };
}

export async function saveBiometrics(
  db: Db,
  studentId: number,
  coachId: number,
  input: {
    enabledModules?: AiModuleKey[];
    age?: number | null;
    restingHr?: number | null;
    maxHr?: number | null;
    maxHrMethod?: MaxHrMethod;
    limitations?: string;
    contraindicatedMovements?: string[];
  },
  now: string,
): Promise<StudentBiometrics> {
  const existing = await loadBiometrics(db, studentId);
  const enabledModules = input.enabledModules
    ? input.enabledModules.filter((m): m is AiModuleKey => ALL_AI_MODULES.includes(m))
    : existing.enabledModules;

  const age = input.age !== undefined ? (input.age ? Math.max(10, Math.min(100, Math.round(input.age))) : null) : existing.age;
  const restingHr = input.restingHr !== undefined ? (input.restingHr ? Math.max(30, Math.min(180, Math.round(input.restingHr))) : null) : existing.restingHr;
  const maxHrMethod: MaxHrMethod = input.maxHrMethod ?? existing.maxHrMethod;
  const customMax = input.maxHr !== undefined ? input.maxHr : existing.maxHrMethod === 'custom' ? existing.maxHr : null;
  if (maxHrMethod === 'custom' && !customMax) {
    throw new HttpError(400, 'برای روش ثبت مستقیم، ضربان بیشینه را وارد کنید.');
  }
  const maxHr = maxHrMethod === 'custom' && customMax
    ? Math.max(100, Math.min(240, Math.round(customMax)))
    : calculateMaxHeartRate(age, maxHrMethod);
  if (restingHr !== null && (age !== null || maxHrMethod === 'custom') && restingHr >= maxHr) {
    throw new HttpError(400, 'ضربان استراحت باید کمتر از ضربان بیشینه باشد.');
  }

  const limitations = input.limitations !== undefined ? String(input.limitations).slice(0, 2000) : existing.limitations;
  const contraindicatedMovements = input.contraindicatedMovements ?? existing.contraindicatedMovements;

  await db.query(
    `INSERT INTO student_biometrics (
      student_id, coach_id, enabled_modules, age, resting_hr, max_hr, max_hr_method, limitations, contraindicated_movements, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (student_id) DO UPDATE SET
      coach_id = excluded.coach_id,
      enabled_modules = excluded.enabled_modules,
      age = excluded.age,
      resting_hr = excluded.resting_hr,
      max_hr = excluded.max_hr,
      max_hr_method = excluded.max_hr_method,
      limitations = excluded.limitations,
      contraindicated_movements = excluded.contraindicated_movements,
      updated_at = excluded.updated_at`,
    [
      studentId,
      coachId,
      JSON.stringify(enabledModules),
      age,
      restingHr,
      maxHr,
      maxHrMethod,
      limitations,
      JSON.stringify(contraindicatedMovements),
      now,
    ],
  );

  const zones = calculateHeartRateZones(maxHr, restingHr);

  return {
    studentId,
    coachId,
    enabledModules,
    age,
    restingHr,
    maxHr,
    maxHrMethod,
    limitations,
    contraindicatedMovements,
    zones,
    updatedAt: now,
  };
}

export function validateBiometricsInput(body: unknown): {
  enabledModules?: AiModuleKey[];
  age?: number | null;
  restingHr?: number | null;
  maxHr?: number | null;
  maxHrMethod?: MaxHrMethod;
  limitations?: string;
  contraindicatedMovements?: string[];
} {
  const obj = requireObject(body);
  const result: ReturnType<typeof validateBiometricsInput> = {};

  if ('enabledModules' in obj) {
    if (!Array.isArray(obj.enabledModules)) throw new HttpError(400, 'ماژول‌های هوش باید به صورت آرایه باشند.');
    result.enabledModules = obj.enabledModules.filter((m): m is AiModuleKey => ALL_AI_MODULES.includes(m as AiModuleKey));
  }

  if ('age' in obj) {
    if (obj.age === null || obj.age === '') result.age = null;
    else if (typeof obj.age === 'number' && obj.age >= 10 && obj.age <= 100) result.age = Math.round(obj.age);
    else throw new HttpError(400, 'سن باید بین ۱۰ تا ۱۰۰ سال باشد.');
  }

  if ('restingHr' in obj) {
    if (obj.restingHr === null || obj.restingHr === '') result.restingHr = null;
    else if (typeof obj.restingHr === 'number' && obj.restingHr >= 30 && obj.restingHr <= 180) result.restingHr = Math.round(obj.restingHr);
    else throw new HttpError(400, 'ضربان استراحت باید بین ۳۰ تا ۱۸۰ ضربه در دقیقه باشد.');
  }

  if ('maxHr' in obj) {
    if (obj.maxHr === null || obj.maxHr === '') result.maxHr = null;
    else if (typeof obj.maxHr === 'number' && obj.maxHr >= 100 && obj.maxHr <= 240) result.maxHr = Math.round(obj.maxHr);
    else throw new HttpError(400, 'حداکثر ضربان قلب باید بین ۱۰۰ تا ۲۴۰ ضربه در دقیقه باشد.');
  }

  if ('maxHrMethod' in obj) {
    const m = String(obj.maxHrMethod);
    if (m === 'tanaka' || m === 'fox' || m === 'custom') result.maxHrMethod = m;
    else throw new HttpError(400, 'روش محاسبه ضربان بیشینه نامعتبر است.');
  }

  if ('limitations' in obj) {
    if (typeof obj.limitations === 'string') result.limitations = obj.limitations;
    else throw new HttpError(400, 'محدودیت‌ها باید به صورت متن باشند.');
  }

  if ('contraindicatedMovements' in obj) {
    if (Array.isArray(obj.contraindicatedMovements)) {
      result.contraindicatedMovements = obj.contraindicatedMovements.map(String);
    }
  }

  return result;
}
