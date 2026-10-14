import { exercises } from '../data/exercises';
import type { WorkoutSession } from '../types';

export type HealthTrackerSource = 'manual' | 'whoop' | 'oura' | 'apple_health';

export interface HealthMetrics {
  sleepHours: number;
  sleepQualityScore: number; // 0-100
  restingHeartRate: number; // bpm
  heartRateVariability: number; // ms (HRV)
  source: HealthTrackerSource;
  lastSyncedAt: string;
}

export interface ReadinessResult {
  score: number; // 0 - 100
  level: 'peak' | 'optimal' | 'recovery' | 'fatigued';
  levelLabel: string;
  badgeClass: string;
  color: string;
  dailyStrain: number; // 0.0 - 21.0 (Whoop scale)
  recoveryTitle: string;
  coachRecommendation: string;
  source: HealthTrackerSource;
}

export type MuscleZoneKey =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'quads'
  | 'hamstringsGlutes'
  | 'core';

export interface MuscleRecoveryStatus {
  zoneKey: MuscleZoneKey;
  label: string;
  recoveryPercent: number; // 0 - 100
  status: 'fresh' | 'recovering' | 'fatigued';
  statusLabel: string;
  color: string;
  hoursUntilFull: number;
  lastTrainedAt?: string;
  setsLast3Days: number;
}

export type JointKey = 'knees' | 'shoulders' | 'lowerBack' | 'neck' | 'wristsElbows';

export interface PrehabExercise {
  id: string;
  name: string;
  sets: string;
  reps: string;
  purpose: string;
  instructions: string;
}

export interface JointPrehabRoutine {
  jointKey: JointKey;
  label: string;
  commonSymptoms: string;
  exercises: PrehabExercise[];
}

export type CaloricDensityCategory = 'green' | 'yellow' | 'red';

export interface CaloricCategoryInfo {
  category: CaloricDensityCategory;
  label: string;
  targetPercentage: string;
  description: string;
  color: string;
  examples: string[];
}

export type MindfulHungerTrigger =
  | 'physical_hunger'
  | 'stress_anxiety'
  | 'boredom_habit'
  | 'social_celebration';

export interface MindfulInsight {
  trigger: MindfulHungerTrigger;
  label: string;
  advice: string;
  color: string;
}

const STORAGE_KEY_METRICS = 'meety_ai_health_metrics_v1';
const STORAGE_KEY_JOINTS = 'meety_ai_joint_status_v1';
const STORAGE_KEY_MINDFUL = 'meety_ai_mindful_logs_v1';

export const DEFAULT_HEALTH_METRICS: HealthMetrics = {
  sleepHours: 7.5,
  sleepQualityScore: 82,
  restingHeartRate: 58,
  heartRateVariability: 65,
  source: 'manual',
  lastSyncedAt: new Date().toISOString(),
};

/**
 * Load health metrics from localStorage or defaults
 */
export function getStoredHealthMetrics(): HealthMetrics {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_METRICS);
    if (!raw) return DEFAULT_HEALTH_METRICS;
    const parsed = JSON.parse(raw) as Partial<HealthMetrics>;
    return {
      ...DEFAULT_HEALTH_METRICS,
      ...parsed,
    };
  } catch {
    return DEFAULT_HEALTH_METRICS;
  }
}

/**
 * Persist health metrics
 */
export function saveHealthMetrics(metrics: Partial<HealthMetrics>): HealthMetrics {
  const current = getStoredHealthMetrics();
  const updated: HealthMetrics = {
    ...current,
    ...metrics,
    lastSyncedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(updated));
  } catch {
    // Ignore storage quota errors
  }
  return updated;
}

/**
 * Simulate live sync from Whoop, Oura, or Apple Health
 */
export function simulateTrackerSync(source: HealthTrackerSource): HealthMetrics {
  const now = new Date();
  const isNight = now.getHours() < 7 || now.getHours() > 22;
  
  // High fidelity realistic ranges
  let sleepHours = 7.2 + Math.floor(Math.random() * 15) / 10;
  if (isNight) sleepHours = 6.8;
  const sleepQuality = Math.min(98, Math.max(65, Math.floor(75 + Math.random() * 20)));
  const rhr = Math.min(68, Math.max(48, Math.floor(52 + Math.random() * 14)));
  const hrv = Math.min(95, Math.max(45, Math.floor(55 + Math.random() * 35)));

  return saveHealthMetrics({
    sleepHours,
    sleepQualityScore: sleepQuality,
    restingHeartRate: rhr,
    heartRateVariability: hrv,
    source,
  });
}

/**
 * Whoop / Oura style Readiness & Recovery calculation
 */
export function calculateReadinessScore(
  metrics: HealthMetrics,
  sessions: WorkoutSession[],
  now = new Date(),
): ReadinessResult {
  const nowMs = now.getTime();
  const past3DaysMs = 72 * 60 * 60 * 1000;

  // Calculate training load strain over past 72 hours
  const recentCompleted = sessions.filter((s) => {
    if (s.status !== 'completed') return false;
    const sessionTime = new Date(s.completedAt || s.startedAt).getTime();
    return nowMs - sessionTime <= past3DaysMs;
  });

  let totalRecentSets = 0;
  let totalVolumeKg = 0;
  for (const session of recentCompleted) {
    for (const ex of session.exercises) {
      totalRecentSets += ex.sets.length;
      for (const set of ex.sets) {
        totalVolumeKg += (set.weightKg || 0) * (set.reps || 0);
      }
    }
  }

  // Calculate Strain on Whoop 0-21 logarithmic scale
  // 1 session with ~15 sets = ~11-13 strain. Multiple heavy days push toward 16-19.
  const volumeFactor = Math.log10(Math.max(10, totalVolumeKg)) * 2.8;
  const setFactor = Math.min(10, totalRecentSets * 0.25);
  const rawStrain = Math.min(20.5, Math.max(4.0, volumeFactor + setFactor));
  const dailyStrain = Math.round(rawStrain * 10) / 10;

  // Sleep score contribution (35%)
  const sleepRatio = Math.min(1.1, metrics.sleepHours / 8.0);
  const sleepFactor = ((sleepRatio * 0.5) + (metrics.sleepQualityScore / 100 * 0.5)) * 100;

  // HRV & Resting Heart Rate contribution (35%)
  // Baseline: RHR 55 bpm is great, HRV 65+ is great
  const rhrScore = Math.max(30, Math.min(100, 100 - (metrics.restingHeartRate - 50) * 2.2));
  const hrvScore = Math.max(30, Math.min(100, (metrics.heartRateVariability / 80) * 100));
  const biometricFactor = (rhrScore * 0.4) + (hrvScore * 0.6);

  // Fatigue deduction from recent strain (30%)
  // High recent strain (e.g. 18+) lowers next-day readiness if sleep is average
  const strainFatiguePenalty = Math.max(0, (dailyStrain - 10) * 3.5);

  const rawScore = (sleepFactor * 0.45) + (biometricFactor * 0.4) + 15 - strainFatiguePenalty;
  const score = Math.min(99, Math.max(25, Math.round(rawScore)));

  if (score >= 80) {
    return {
      score,
      level: 'peak',
      levelLabel: 'اوج آمادگی فیزیولوژیک (سبک Whoop سبز)',
      badgeClass: 'badge--success',
      color: '#10b981',
      dailyStrain,
      recoveryTitle: 'سیستم عصبی و قلبی کاملاً آماده است',
      coachRecommendation:
        'شاخص‌های بازیابی بدنی شما در اوج است. امروز بهترین فرصت برای بیش‌باری تدریجی، افزایش وزنه در حرکات اصلی یا ثبت رکوردهای تازه است.',
      source: metrics.source,
    };
  }

  if (score >= 60) {
    return {
      score,
      level: 'optimal',
      levelLabel: 'آمادگی مطلوب و پایدار',
      badgeClass: 'badge--info',
      color: '#3b82f6',
      dailyStrain,
      recoveryTitle: 'بدن در تعادل مناسب قرار دارد',
      coachRecommendation:
        'ریکاوری شما در محدودهٔ مطلوب است. برنامهٔ مربی را با تمرکز بر دامنه حرکتی کامل و حفظ فرم تمیز طبق روال عادی اجرا کن.',
      source: metrics.source,
    };
  }

  if (score >= 42) {
    return {
      score,
      level: 'recovery',
      levelLabel: 'نیاز به ریکاوری فعال (ناحیه زرد)',
      badgeClass: 'badge--warning',
      color: '#f59e0b',
      dailyStrain,
      recoveryTitle: 'خستگی تجمعی در حال افزایش است',
      coachRecommendation:
        'فشار روزهای اخیر یا خواب کمتر روی شاخص‌های فیزیولوژیک اثر گذاشته است. توصیه می‌شود حجم تمرین را اندکی متعادل نگه‌داری و از ست‌های تا مرز ناتوانی مطلق پرهیز کنی.',
      source: metrics.source,
    };
  }

  return {
    score,
    level: 'fatigued',
    levelLabel: 'خستگی بدنی بالا (ناحیه قرمز)',
    badgeClass: 'badge--danger',
    color: '#ef4444',
    dailyStrain,
    recoveryTitle: 'نیازمند استراحت یا موبیلیتی سبک',
    coachRecommendation:
      'سیستم عصبی و عضلانی به بازیابی نیاز دارد. انجام حرکات کششی، موبیلیتی مفاصل و خواب کافی امروز ارجحیت بالاتری نسبت به وزنه‌های سنگین دارد.',
    source: metrics.source,
  };
}

/**
 * Muscle Zone configuration for Fitbod Muscle Heatmap
 */
export const MUSCLE_ZONE_CONFIG: Record<MuscleZoneKey, { label: string; primaryTerms: string[] }> = {
  chest: {
    label: 'سینه',
    primaryTerms: ['سینه', 'بالاسینه', 'سینهٔ پایین'],
  },
  back: {
    label: 'پشت و زیربغل',
    primaryTerms: ['زیربغل', 'پشت و زیربغل', 'بخش میانی پشت', 'بخش بالایی پشت', 'بالای پشت', 'ذوزنقه', 'عضلهٔ ذوزنقه‌ای فوقانی', 'بخش میانی ذوزنقه‌ای', 'ذوزنقه پایینی'],
  },
  shoulders: {
    label: 'سرشانه‌ها',
    primaryTerms: ['سرشانه', 'سرشانهٔ جلویی', 'سرشانهٔ میانی', 'بخش میانی سرشانه', 'سرشانهٔ پشتی', 'عضلات پشت شانه', 'پشت سرشانه', 'عضلات چرخانندهٔ شانه', 'شانه'],
  },
  arms: {
    label: 'بازو و ساعد',
    primaryTerms: ['جلو بازو', 'بازو دوسر', 'بازوی جلویی', 'پشت بازو', 'پشت بازو (سر بلند)', 'عضلهٔ بازویی', 'ساعد', 'قدرت گیرش'],
  },
  quads: {
    label: 'چهارسر ران و ساق',
    primaryTerms: ['چهارسر ران', 'چهارسر', 'جلوی ساق (تیبیالیس)', 'ساق', 'ساق پا', 'عضلهٔ نعلی'],
  },
  hamstringsGlutes: {
    label: 'همسترینگ و سرینی',
    primaryTerms: ['همسترینگ', 'پشت پا', 'عضلات سرینی', 'سرینی', 'باسن', 'لگن', 'نزدیک‌کننده‌های ران', 'نزدیک‌کننده‌ها', 'دورکننده‌ها'],
  },
  core: {
    label: 'میان‌تنه و فیله',
    primaryTerms: ['عضلات شکم', 'شکم', 'میان‌تنه', 'عضلات مرکزی', 'عضلات مورب شکمی', 'مورب شکمی', 'بازکننده‌های ستون فقرات', 'فیله کمر', 'عضلات کمر', 'تنه', 'دندانه‌ای قدامی', 'دنده‌ای', 'خم‌کننده‌های لگن', 'فلکسورهای ران'],
  },
};

/**
 * Map exercise to muscle zone impacts
 */
function getMuscleZoneImpact(exerciseId: string): { primary: MuscleZoneKey[]; secondary: MuscleZoneKey[] } {
  const def = exercises.find((e) => e.id === exerciseId);
  if (!def) {
    // Fallback checks by ID naming
    const lower = exerciseId.toLowerCase();
    if (lower.includes('bench') || lower.includes('chest') || lower.includes('press') && !lower.includes('shoulder')) {
      return { primary: ['chest'], secondary: ['shoulders', 'arms'] };
    }
    if (lower.includes('squat') || lower.includes('leg-ext')) {
      return { primary: ['quads'], secondary: ['hamstringsGlutes', 'core'] };
    }
    if (lower.includes('row') || lower.includes('pull')) {
      return { primary: ['back'], secondary: ['arms'] };
    }
    return { primary: ['core'], secondary: [] };
  }

  const primary: MuscleZoneKey[] = [];
  const secondary: MuscleZoneKey[] = [];

  for (const [key, config] of Object.entries(MUSCLE_ZONE_CONFIG) as [MuscleZoneKey, { label: string; primaryTerms: string[] }][]) {
    const hitsPrimary = def.primaryMuscles.some((m) => config.primaryTerms.includes(m));
    const hitsSecondary = def.secondaryMuscles.some((m) => config.primaryTerms.includes(m));
    if (hitsPrimary) primary.push(key);
    else if (hitsSecondary) secondary.push(key);
  }

  return { primary, secondary };
}

/**
 * Fitbod style dynamic Muscle Recovery Heatmap
 */
export function calculateMuscleRecovery(
  sessions: WorkoutSession[],
  now = new Date(),
): MuscleRecoveryStatus[] {
  const nowMs = now.getTime();
  const maxLookbackHours = 96; // 4 days lookback
  const maxLookbackMs = maxLookbackHours * 60 * 60 * 1000;

  // Track raw fatigue impact and last trained timestamp for each zone
  const zoneStats: Record<MuscleZoneKey, { fatigue: number; lastTrainedMs: number; sets3Days: number }> = {
    chest: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    back: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    shoulders: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    arms: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    quads: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    hamstringsGlutes: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
    core: { fatigue: 0, lastTrainedMs: 0, sets3Days: 0 },
  };

  const completed = sessions.filter((s) => s.status === 'completed');

  for (const session of completed) {
    const sessionTime = new Date(session.completedAt || session.startedAt).getTime();
    const elapsedMs = nowMs - sessionTime;
    if (elapsedMs < 0 || elapsedMs > maxLookbackMs) continue;

    const elapsedHours = elapsedMs / (1000 * 60 * 60);

    for (const ex of session.exercises) {
      const setCount = ex.sets.length;
      if (setCount === 0) continue;

      const impact = getMuscleZoneImpact(ex.exerciseId);

      for (const zone of impact.primary) {
        zoneStats[zone].sets3Days += setCount;
        if (sessionTime > zoneStats[zone].lastTrainedMs) {
          zoneStats[zone].lastTrainedMs = sessionTime;
        }
        // Base fatigue: each set adds fatigue that decays exponentially
        // Exponential decay: e^(-0.05 * hours) -> ~50% decay after 14h, 85% decay after 36h, 95% after 60h
        const addedFatigue = setCount * 8.5 * Math.exp(-0.048 * elapsedHours);
        zoneStats[zone].fatigue += addedFatigue;
      }

      for (const zone of impact.secondary) {
        zoneStats[zone].sets3Days += Math.round(setCount * 0.5);
        if (sessionTime > zoneStats[zone].lastTrainedMs) {
          zoneStats[zone].lastTrainedMs = sessionTime;
        }
        const addedFatigue = setCount * 4.0 * Math.exp(-0.048 * elapsedHours);
        zoneStats[zone].fatigue += addedFatigue;
      }
    }
  }

  const results: MuscleRecoveryStatus[] = [];

  for (const [key, config] of Object.entries(MUSCLE_ZONE_CONFIG) as [MuscleZoneKey, { label: string; primaryTerms: string[] }][]) {
    const stats = zoneStats[key];
    const clampedFatigue = Math.min(85, stats.fatigue);
    const recoveryPercent = Math.max(15, Math.min(100, Math.round(100 - clampedFatigue)));

    let status: 'fresh' | 'recovering' | 'fatigued' = 'fresh';
    let statusLabel = 'آماده تمرین سنگین';
    let color = '#10b981'; // Green

    if (recoveryPercent < 55) {
      status = 'fatigued';
      statusLabel = 'نیاز به استراحت و ترمیم';
      color = '#ef4444'; // Red
    } else if (recoveryPercent < 85) {
      status = 'recovering';
      statusLabel = 'در حال بازیابی عضلانی';
      color = '#f59e0b'; // Amber
    }

    // Calculate approximate hours until 100% full recovery
    const hoursUntilFull = recoveryPercent >= 98 ? 0 : Math.ceil((100 - recoveryPercent) * 0.55);

    results.push({
      zoneKey: key,
      label: config.label,
      recoveryPercent,
      status,
      statusLabel,
      color,
      hoursUntilFull,
      lastTrainedAt: stats.lastTrainedMs > 0 ? new Date(stats.lastTrainedMs).toISOString() : undefined,
      setsLast3Days: stats.sets3Days,
    });
  }

  return results;
}

/**
 * Hinge Health Prehab & Joint Care Routines
 */
export const HINGE_JOINT_ROUTINES: Record<JointKey, JointPrehabRoutine> = {
  knees: {
    jointKey: 'knees',
    label: 'مفصل زانو و کشکک',
    commonSymptoms: 'حساسیت در انتهای دامنه اسکوات یا فرود، صدای تق‌تق یا سفتی کاسه زانو',
    exercises: [
      {
        id: 'spanish-squat-hold',
        name: 'ایستایی کش با زاویه زانو (Spanish Squat Hold)',
        sets: '۳ ست',
        reps: '۳۰ ثانیه مکث',
        purpose: 'افزایش خون‌رسانی و کاهش درد تاندون پاتلار بدون فشار بر مفصل',
        instructions: 'کش مقاومتی را پشت زانوها قرار بده، با تکیه به عقب در زاویه ۴۵ تا ۶۰ درجه زانو ثابت بمان.',
      },
      {
        id: 'terminal-knee-extension',
        name: 'اکستنشن انتهایی زانو با کش (TKE)',
        sets: '۲ ست',
        reps: '۱۵ تکرار هر پا',
        purpose: 'فعال‌سازی عضله پهن داخلی (VMO) جهت ثبات کاسه زانو',
        instructions: 'پاشنه پا را زمین بگذار، زانو را در برابر مقاومت کش کاملاً صاف و قفل کن.',
      },
      {
        id: 'poliquin-stepup',
        name: 'استپ‌آپ کوتاه پاشنه (Poliquin Step-Up)',
        sets: '۲ ست',
        reps: '۱۲ تکرار هر پا',
        purpose: 'تقویت تاندون زانو در زاویه فلکشن قدامی',
        instructions: 'روی صفحه ۵ تا ۱۰ سانتی‌متری بایست و پاشنه پای آزاد را کنترل‌شده با زمین مماس کن.',
      },
    ],
  },
  shoulders: {
    jointKey: 'shoulders',
    label: 'مفصل شانه و روتاتور کاف',
    commonSymptoms: 'گیرکردن شانه در پرس بالای سر، احساس کشش نامطلوب در بخش جلویی شانه',
    exercises: [
      {
        id: 'band-pull-apart',
        name: 'دور کردن کش در سطح سینه (Band Pull-Apart)',
        sets: '۲ ست',
        reps: '۱۵ تا ۲۰ تکرار',
        purpose: 'فعال‌سازی عضلات متصل‌کننده کتف و بخش پشتی شانه',
        instructions: 'دست‌ها کاملاً صاف، کش را به سمت سینه باز کن تا کتف‌ها در پشت فشرده شوند.',
      },
      {
        id: 'wall-slide',
        name: 'لغزش دست روی دیوار (Scapular Wall Slide)',
        sets: '۲ ست',
        reps: '۱۰ تکرار با مکث',
        purpose: 'بهبود چرخش بالایی کتف و رفع گیرکردن شانه در پرس‌ها',
        instructions: 'ساعدها و کمر به دیوار بچسبد؛ دست‌ها را بدون بلند شدن ستون فقرات بالا بکش.',
      },
      {
        id: 'cable-external-rotation-prehab',
        name: 'چرخش خارجی شانه با کش یا سیم‌کش',
        sets: '۲ ست',
        reps: '۱۲ تکرار آرام',
        purpose: 'فعال‌سازی تخصصی عضلات اینفرااسپیناتوس و ترس مینور',
        instructions: 'آرنج را در زاویه ۹۰ درجه چسبیده به پهلو نگه دار و مچ را به بیرون بچرخان.',
      },
    ],
  },
  lowerBack: {
    jointKey: 'lowerBack',
    label: 'کمر و ستون فقرات کمری',
    commonSymptoms: 'احساس گرفتگی فیله کمر، خستگی بعد از ددلیفت یا نشستن طولانی‌مدت',
    exercises: [
      {
        id: 'mcgill-bird-dog',
        name: 'حرکت پرنده-سگ مک‌گیل (McGill Bird-Dog)',
        sets: '۳ ست',
        reps: '۶ تکرار هر سمت (مکث ۶ ثانیه)',
        purpose: 'پایداری ستون فقرات بدون تحمیل بار فشاری به مهره‌ها',
        instructions: 'دست و پای مخالف را هم‌راستای تنه بکش؛ تنه نباید دچار چرخش یا گودی شود.',
      },
      {
        id: 'cat-cow-controlled',
        name: 'موبیلیتی گربه-گاو کنترل‌شده (Cat-Cow)',
        sets: '۲ ست',
        reps: '۸ دور آرام',
        purpose: 'آزادسازی فاشیا و بازیابی دامنه حرکتی مهره‌های کمری و پشتی',
        instructions: 'با هر دم قفسه سینه را باز کن و با بازدم مهره‌به‌مهره کمر را به سقف نزدیک کن.',
      },
      {
        id: 'glute-bridge-activation',
        name: 'پل باسن ایزومتریک (Glute Bridge)',
        sets: '۲ ست',
        reps: '۱۲ تکرار (مکث ۳ ثانیه در بالا)',
        purpose: 'بیداری عضلات سرینی برای برداشتن بار اضافه از روی مهره‌های کمری',
        instructions: 'با فشار پاشنه باسن را بلند کن و عضلات سرینی را منقبض نگه دار.',
      },
    ],
  },
  neck: {
    jointKey: 'neck',
    label: 'گردن و مهره‌های فوقانی',
    commonSymptoms: 'سفتی عضلات ذوزنقه و پشت گردن ناشی از کار با نمایشگر یا انقباض ناخواسته در کول',
    exercises: [
      {
        id: 'chin-tuck',
        name: 'عقب کشیدن چانه (Chin Tuck)',
        sets: '۲ ست',
        reps: '۱۰ تکرار (مکث ۵ ثانیه)',
        purpose: 'تقویت عضلات عمقی خم‌کننده گردن',
        instructions: 'بدون خم کردن سر به پایین، چانه را صاف به عقب ببر مانند ایجاد غبغب خفیف.',
      },
      {
        id: 'upper-trap-stretch',
        name: 'کشش ملایم بخش فوقانی ذوزنقه',
        sets: '۲ ست',
        reps: '۲۰ ثانیه هر سمت',
        purpose: 'کاهش اسپاسم شانه و گردن',
        instructions: 'دست را پشت کمر قرار بده و گوش مخالف را به‌آرامی به سمت شانه متمایل کن.',
      },
    ],
  },
  wristsElbows: {
    jointKey: 'wristsElbows',
    label: 'مچ دست و آرنج (تنیس / گلف البو)',
    commonSymptoms: 'تیر کشیدن بخش خارجی یا داخلی آرنج در حرکات جلوبازو و کشش‌ها',
    exercises: [
      {
        id: 'wrist-eccentric-extension',
        name: 'اکستنشن اکستنتریک مچ دست (Tyler Twist)',
        sets: '۲ ست',
        reps: '۱۵ تکرار آرام',
        purpose: 'ترمیم و افزایش تحمل تاندون‌های اپی‌کوندیل جانبی',
        instructions: 'با کمک دست دیگر وزنه یا میله را بالا ببر و تنها با دست هدف با ۳ ثانیه مکث پایین بیاور.',
      },
      {
        id: 'forearm-pronator-stretch',
        name: 'کشش پرونیتور و فلکسورهای ساعد',
        sets: '۲ ست',
        reps: '۲۰ ثانیه مکث',
        purpose: 'کاهش کشش روی عصب اولنار و تاندون‌های مچ',
        instructions: 'کف دست را با انگشتان رو به پایین روی میز بگذار و به‌آرامی به جلو تکیه کن.',
      },
    ],
  },
};

/**
 * Persist active joint concerns
 */
export function getStoredJointConcerns(): JointKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JOINTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStoredJointConcerns(concerns: JointKey[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_JOINTS, JSON.stringify(concerns));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Noom Caloric Density Model
 */
export const NOOM_CALORIC_CATEGORIES: Record<CaloricDensityCategory, CaloricCategoryInfo> = {
  green: {
    category: 'green',
    label: 'سبز (چگالی کالری پایین)',
    targetPercentage: '۴۵ تا ۵۰ درصد کل حجم غذا',
    description: 'حاوی آب و فیبر بالا با کالری کم؛ به سیر نگه داشتن شما با حجم زیاد کمک می‌کند.',
    color: '#10b981',
    examples: [
      'میوه‌ها (سیب، پرتقال، توت، هندوانه)',
      'سبزیجات تازه و پخته (خیار، گوجه، اسفناج، هویج، کاهو)',
      'جو دوسر پرک پخته در آب',
      'برنج کته و سوپ‌های بر پایه سبزیجات',
      'سفیده تخم‌مرغ و لبنیات بدون چربی',
    ],
  },
  yellow: {
    category: 'yellow',
    label: 'زرد (چگالی کالری متعادل)',
    targetPercentage: '۳۰ تا ۳۵ درصد کل حجم غذا',
    description: 'پروتئین‌های مغذی و نشاسته‌های پیچیده که انرژی پایدار و ساخت عضلانی را فراهم می‌کنند.',
    color: '#f59e0b',
    examples: [
      'سینه مرغ و بوقلمون بدون چربی',
      'ماهی تن، سالمون و تیلاپیا',
      'تخم‌مرغ کامل',
      'حبوبات (عدس، لوبیا، نخود)',
      'نان سنگک و نان سبوس‌دار کامل',
      'ماست یونانی کم‌چرب و شیر کم‌چرب',
    ],
  },
  red: {
    category: 'red',
    label: 'قرمز/نارنجی (چگالی کالری بالا)',
    targetPercentage: '۱۵ تا ۲۰ درصد کل حجم غذا',
    description: 'مواد غذایی پرکالری در حجم کم؛ مصرف باید با هوشیاری و اندازه‌گیری انجام شود.',
    color: '#ef4444',
    examples: [
      'روغن زیتون، روغن کنجد و کره',
      'آجیل‌ها (گردو، بادام، پسته) و کره بادام زمینی',
      'شکلات تلخ و شیرینی‌جات',
      'پنیر پیتزا و پنیرهای چرب',
      'سس مایونز و فست‌فودها',
    ],
  },
};

/**
 * Classify food into Noom caloric density colors
 */
export function classifyFoodCaloricDensity(foodName: string): CaloricDensityCategory {
  const name = foodName.toLowerCase().trim();

  // Green category identifiers
  const greenTerms = [
    'سیب', 'موز', 'پرتقال', 'خیار', 'گوجه', 'کاهو', 'اسفناج', 'سالاد', 'کلم', 'هویج',
    'توت', 'سوپ', 'هندوانه', 'گریپ‌فروت', 'قارچ', 'کدو', 'بادمجان', 'سفیده', 'سبزی',
    'آبمیوه', 'اوتمیل', 'جو دوسر'
  ];

  // Red/Orange category identifiers
  const redTerms = [
    'روغن', 'کره', 'آجیل', 'گردو', 'بادام', 'پسته', 'شکلات', 'کیک', 'شیرینی', 'مایونز',
    'پنیر پیتزا', 'چیپس', 'پفک', 'فست‌فود', 'پیتزا', 'همبرگر', 'سس چرب', 'سوسیس', 'کالباس',
    'خامه', 'شکر', 'حلوا'
  ];

  if (redTerms.some((t) => name.includes(t))) return 'red';
  if (greenTerms.some((t) => name.includes(t))) return 'green';

  // Default protein/starch staples belong to Yellow
  return 'yellow';
}

/**
 * Noom Mindful Eating Insights
 */
export const MINDFUL_INSIGHTS: Record<MindfulHungerTrigger, MindfulInsight> = {
  physical_hunger: {
    trigger: 'physical_hunger',
    label: 'گرسنگی فیزیکی واقعی',
    advice: 'بدن شما به سوخت نیاز دارد. بشقاب خود را با نسبت ۴۵٪ سبزیجات و میوه‌ها، ۳۵٪ پروتئین و ۲۰٪ چربی سالم پر کن.',
    color: '#10b981',
  },
  stress_anxiety: {
    trigger: 'stress_anxiety',
    label: 'غذا خوردن ناشی از استرس',
    advice: 'مغز در حالت استرس دوپامین سریع می‌طلبد. قبل از غذا خوردن، ۵ نفس عمیق بکش یا یک لیوان آب خنک بنوش تا موج اولیه ولع فروکش کند.',
    color: '#f59e0b',
  },
  boredom_habit: {
    trigger: 'boredom_habit',
    label: 'عادت یا رفع بی‌حوصلگی',
    advice: 'این گرسنگی در سر شماست نه معده. ۵ دقیقه قدم بزن، آب بنوش، یا یک کار دستی کوتاه انجام بده. اگر بعد از ۱۰ دقیقه هنوز گرسنه بودی، یک میوه انتخاب کن.',
    color: '#3b82f6',
  },
  social_celebration: {
    trigger: 'social_celebration',
    label: 'لذت اجتماعی و همراهی با جمع',
    advice: 'از همنشینی لذت ببر بدون احساس گناه! آرام غذا بخور، لقمه‌ها را خوب بجو و به محض رسیدن به سیری نسبی قاشق را کنار بگذار.',
    color: '#8b5cf6',
  },
};

export interface MindfulLogEntry {
  id: string;
  timestamp: string;
  foodName: string;
  trigger: MindfulHungerTrigger;
  category: CaloricDensityCategory;
  notes?: string;
}

export function getStoredMindfulLogs(): MindfulLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MINDFUL);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMindfulLog(entry: Omit<MindfulLogEntry, 'id' | 'timestamp'>): MindfulLogEntry {
  const logs = getStoredMindfulLogs();
  const newEntry: MindfulLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  const updated = [newEntry, ...logs].slice(0, 100);
  try {
    localStorage.setItem(STORAGE_KEY_MINDFUL, JSON.stringify(updated));
  } catch {
    // Ignore quota errors
  }
  return newEntry;
}
