import { api } from './api';

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

export interface StudentBiometricsData {
  studentId: number;
  coachId?: number;
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

export interface AiModuleInfo {
  key: AiModuleKey;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  icon: string;
}

export const AI_MODULES_INFO: Record<AiModuleKey, AiModuleInfo> = {
  recovery: {
    key: 'recovery',
    title: 'آمادگی و ریکاوری روزانه',
    subtitle: 'موتور Whoop & Oura',
    description: 'تحلیل نمره آمادگی روزانه (Readiness)، کیفیت خواب، ضربان استراحت و نرخ فشار (Strain).',
    color: '#10b981',
    icon: 'HeartPulse',
  },
  muscles: {
    key: 'muscles',
    title: 'نقشه ترمیم و خستگی عضلات',
    subtitle: 'الگوریتم Fitbod',
    description: 'محاسبه درصد بازسازی ۷ گروه عضلانی، خستگی تجمعی و زمان لازم تا ریکاوری کامل فیبرها.',
    color: '#06b6d4',
    icon: 'Activity',
  },
  hinge: {
    key: 'hinge',
    title: 'پیشگیری از آسیب و سلامت مفاصل',
    subtitle: 'پروتکل‌های Hinge Health',
    description: 'روتین‌های تخصصی پریهب (Prehab) برای زانو، کمر، شانه، گردن و مچ‌ها متناسب با حرکات برنامه.',
    color: '#8b5cf6',
    icon: 'ShieldAlert',
  },
  noom: {
    key: 'noom',
    title: 'تغذیه آگاهانه و چگالی کالری',
    subtitle: 'روانشناسی تغذیه Noom',
    description: 'طبقه‌بندی رنگی غذاها بر اساس چگالی کالری و ثبت آگاهانه محرک‌های هیجانی غذا خوردن.',
    color: '#f59e0b',
    icon: 'Apple',
  },
};

/**
 * Calculates Maximum Heart Rate (HR_max)
 * - Tanaka formula: 208 - (0.7 * age)
 * - Fox formula: 220 - age
 * - Custom: direct coach measured peak
 */
export function calculateMaxHeartRate(age: number | null | undefined, method: MaxHrMethod = 'tanaka', customMax?: number | null): number {
  if (method === 'custom' && customMax && customMax >= 100 && customMax <= 240) {
    return Math.round(customMax);
  }
  if (age && age >= 10 && age <= 100) {
    if (method === 'fox') {
      return Math.round(220 - age);
    }
    return Math.round(208 - 0.7 * age);
  }
  return 190;
}

/**
 * Calculates 5 Heart Rate Target Zones
 * Uses Karvonen HRR formula when Resting HR is available.
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

const STORAGE_KEY_STUDENT_BIOMETRICS_PREFIX = 'meety.student-biometrics-';

export function getLocalFallbackBiometrics(studentId: number): StudentBiometricsData {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_STUDENT_BIOMETRICS_PREFIX}${studentId}`);
    if (raw) return JSON.parse(raw);
  } catch {}

  const maxHr = 190;
  return {
    studentId,
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

export function saveLocalFallbackBiometrics(data: StudentBiometricsData): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_STUDENT_BIOMETRICS_PREFIX}${data.studentId}`, JSON.stringify(data));
  } catch {}
}

export async function getStudentBiometrics(studentId: number): Promise<StudentBiometricsData> {
  try {
    const res = await api<{ studentName?: string; biometrics: StudentBiometricsData }>('GET', `/students/${studentId}/ai-settings`);
    saveLocalFallbackBiometrics(res.biometrics);
    return res.biometrics;
  } catch {
    return getLocalFallbackBiometrics(studentId);
  }
}

export async function saveStudentBiometricsApi(
  studentId: number,
  data: {
    enabledModules?: AiModuleKey[];
    age?: number | null;
    restingHr?: number | null;
    maxHr?: number | null;
    maxHrMethod?: MaxHrMethod;
    limitations?: string;
    contraindicatedMovements?: string[];
  },
): Promise<StudentBiometricsData> {
  try {
    const res = await api<{ studentName?: string; biometrics: StudentBiometricsData }>('PUT', `/students/${studentId}/ai-settings`, data);
    saveLocalFallbackBiometrics(res.biometrics);
    return res.biometrics;
  } catch (caught) {
    const current = getLocalFallbackBiometrics(studentId);
    const age = data.age !== undefined ? data.age : current.age;
    const restingHr = data.restingHr !== undefined ? data.restingHr : current.restingHr;
    const maxHrMethod = data.maxHrMethod ?? current.maxHrMethod;
    const maxHr = data.maxHr && maxHrMethod === 'custom'
      ? data.maxHr
      : calculateMaxHeartRate(age, maxHrMethod, data.maxHr);
    const updated: StudentBiometricsData = {
      ...current,
      ...data,
      age,
      restingHr,
      maxHrMethod,
      maxHr,
      zones: calculateHeartRateZones(maxHr, restingHr),
      updatedAt: new Date().toISOString(),
    };
    saveLocalFallbackBiometrics(updated);
    return updated;
  }
}

export async function getMyAiSettings(): Promise<StudentBiometricsData> {
  try {
    const res = await api<{ biometrics: StudentBiometricsData }>('GET', '/me/ai-settings');
    saveLocalFallbackBiometrics(res.biometrics);
    return res.biometrics;
  } catch {
    return getLocalFallbackBiometrics(0);
  }
}
