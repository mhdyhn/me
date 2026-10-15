import type { StudentBiometricsData } from './studentAiBiometrics';

export interface DiagnosticIssue {
  id: string;
  category: 'frequency' | 'volume' | 'overload' | 'intensity' | 'recovery' | 'nutrition' | 'orthopedic';
  severity: 'alert' | 'warning' | 'info';
  title: string;
  explanation: string;
  recommendation: string;
}

export interface DiagnosticAuditReport {
  overallStatus: 'needs_attention' | 'optimal' | 'plateau';
  statusLabel: string;
  statusColor: string;
  summaryHeadline: string;
  summaryText: string;
  issues: DiagnosticIssue[];
  metrics: {
    totalSessionsAnalyzed: number;
    weeklyFrequency: number;
    progressiveOverloadTrend: 'growing' | 'flat' | 'declining';
    overloadChangePercent: number;
    avgRir: number | null;
    avgWeeklySets: number;
    restingHrStatus: 'normal' | 'elevated' | 'not_recorded';
  };
}

interface GenericSession {
  id?: string;
  startedAt: string;
  completedAt?: string | null;
  status?: string;
  exercises: Array<{
    exerciseId: string;
    sets: Array<{
      weightKg?: number;
      reps?: number;
      rir?: number;
    }>;
  }>;
}

/**
 * Diagnostic Engine: "چرا شاگرد جواب نگرفته؟"
 * Audits workout logs, biometric indicators, and limitations to diagnose stalls and give actionable coaching remedies.
 */
export function runStudentDiagnostic(
  sessions: GenericSession[],
  biometrics?: StudentBiometricsData | null,
  options?: {
    goal?: string;
    nutritionTargets?: { kcal?: number | null; proteinG?: number | null };
  },
): DiagnosticAuditReport {
  const issues: DiagnosticIssue[] = [];

  // Filter completed or active sessions with sets
  const validSessions = sessions
    .filter((s) => s.exercises && s.exercises.some((e) => e.sets && e.sets.length > 0))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  if (validSessions.length === 0) {
    return {
      overallStatus: 'needs_attention',
      statusLabel: 'عدم ثبت تمرین',
      statusColor: '#ef4444',
      summaryHeadline: 'هنوز داده تمرینی ثبت نشده است',
      summaryText: 'برای ارزیابی و عیب‌یابی روند پیشرفت، حداقل ۱ تا ۲ هفته سابقه تمرین ثبت‌شده نیاز است.',
      issues: [
        {
          id: 'no_sessions',
          category: 'frequency',
          severity: 'alert',
          title: 'هیچ جلسهٔ تمرینی ثبت نشده است',
          explanation: 'شاگرد هنوز ستی در سیستم ثبت نکرده است.',
          recommendation: 'با شاگرد تماس بگیرید و او را برای شروع اولین جلسه تمرین تشویق کنید.',
        },
      ],
      metrics: {
        totalSessionsAnalyzed: 0,
        weeklyFrequency: 0,
        progressiveOverloadTrend: 'flat',
        overloadChangePercent: 0,
        avgRir: null,
        avgWeeklySets: 0,
        restingHrStatus: 'not_recorded',
      },
    };
  }

  // 1. Calculate Frequency (sessions per week in the past 28 days)
  const now = new Date();
  const past28Days = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  const recentSessions = validSessions.filter((s) => new Date(s.startedAt) >= past28Days);
  const weeklyFrequency = Number((recentSessions.length / 4).toFixed(1));

  if (weeklyFrequency < 2.0 && validSessions.length >= 2) {
    issues.push({
      id: 'low_frequency',
      category: 'frequency',
      severity: 'alert',
      title: 'تکرار هفتگی ناکافی و ناپیوستگی در تمرین',
      explanation: `شاگرد در ۴ هفته اخیر به طور میانگین ${weeklyFrequency} جلسه در هفته تمرین کرده است. این مقدار برای ایجاد انطباق عصبی و سنتز منظم پروتئین عضلانی ناکافی است.`,
      recommendation: 'برنامه را برای حداقل ۳ جلسه در هفته بازتنظیم کنید و علت غیبت‌ها (کمبود وقت یا خستگی مفرط) را جویا شوید.',
    });
  }

  // 2. Progressive Overload Analysis
  // Calculate total volume load (sets * reps * weight) for the first half vs second half
  const halfIndex = Math.floor(validSessions.length / 2);
  const firstHalf = validSessions.slice(0, Math.max(1, halfIndex));
  const secondHalf = validSessions.slice(halfIndex);

  const calcTonnage = (sessionList: GenericSession[]) => {
    let tonnage = 0;
    let setsCount = 0;
    for (const sess of sessionList) {
      for (const ex of sess.exercises) {
        for (const set of ex.sets) {
          const w = set.weightKg ?? 0;
          const r = set.reps ?? 0;
          if (w > 0 && r > 0) {
            tonnage += w * r;
            setsCount += 1;
          }
        }
      }
    }
    return { tonnage, setsCount, avgTonnagePerSession: sessionList.length ? tonnage / sessionList.length : 0 };
  };

  const earlyStats = calcTonnage(firstHalf);
  const lateStats = calcTonnage(secondHalf);

  let overloadChangePercent = 0;
  let overloadTrend: 'growing' | 'flat' | 'declining' = 'flat';

  if (earlyStats.avgTonnagePerSession > 0) {
    overloadChangePercent = Number((((lateStats.avgTonnagePerSession - earlyStats.avgTonnagePerSession) / earlyStats.avgTonnagePerSession) * 100).toFixed(1));
    if (overloadChangePercent >= 3) overloadTrend = 'growing';
    else if (overloadChangePercent <= -3) overloadTrend = 'declining';
    else overloadTrend = 'flat';
  }

  if (validSessions.length >= 4 && (overloadTrend === 'flat' || overloadTrend === 'declining')) {
    issues.push({
      id: 'stalled_overload',
      category: 'overload',
      severity: 'alert',
      title: 'فلات و توقف اضافه‌بار تدریجی (Progressive Overload Stall)',
      explanation: `تناژ کاری میانگین شاگرد تغییر محسوسی نداشته است (${overloadChangePercent > 0 ? '+' : ''}${overloadChangePercent}٪). بدن با وزنه‌ها و تکرارهای ثابت سازگار شده و سیگنال رشد جدید دریافت نمی‌کند.`,
      recommendation: 'از سیستم پیشرفت دوگانه (Double Progression) استفاده کنید: ابتدا افزایش تکرارها در بازه معین (مثلاً رسیدن از ۸ به ۱۲ تکرار)، سپس افزایش ۲٫۵ کیلوگرم به وزنه.',
    });
  }

  // 3. Set Intensity (RIR analysis)
  let totalRir = 0;
  let rirCount = 0;
  for (const s of validSessions) {
    for (const ex of s.exercises) {
      for (const set of ex.sets) {
        if (typeof set.rir === 'number' && set.rir >= 0 && set.rir <= 10) {
          totalRir += set.rir;
          rirCount += 1;
        }
      }
    }
  }

  const avgRir = rirCount > 0 ? Number((totalRir / rirCount).toFixed(1)) : null;

  if (avgRir !== null && avgRir >= 3.5) {
    issues.push({
      id: 'low_intensity',
      category: 'intensity',
      severity: 'warning',
      title: 'شدت و تلاش ناکافی در ست‌ها (RIR بالا)',
      explanation: `میانگین تکرار در ذخیره (RIR) ثبت‌شده توسط شاگرد ${avgRir} است. توقف ست‌ها در فاصله زیاد از ناتوانی، فیبرهای عضلانی تند-انقباض هایپرتروفی را به اندازه کافی به کار نمی‌گیرد.`,
      recommendation: 'به شاگرد بیاموزید ست‌های کاری اصلی را با RIR ۱ الی ۲ (۱ یا ۲ تکرار مانده به ناتوانی تکنیکی) به پایان برساند.',
    });
  } else if (avgRir !== null && avgRir === 0 && validSessions.length >= 4) {
    issues.push({
      id: 'excessive_failure',
      category: 'intensity',
      severity: 'warning',
      title: 'تمرین مداوم تا واماندگی مطلق (RIR ۰)',
      explanation: 'بردن تمام ست‌ها به ناتوانی کامل، سیستم عصبی مرکزی (CNS) را فرسوده کرده و زمان ریکاوری را دوبرابر می‌کند بدون اینکه عضله‌سازی بیشتری ایجاد کند.',
      recommendation: 'تنها آخرین ست هر حرکت را تا نزدیکی ناتوانی ببرید و در ست‌های اولیه ۱ تا ۲ تکرار در ذخیره نگه دارید.',
    });
  }

  // 4. Volume Audit (Average sets per week)
  const totalSets = validSessions.reduce((acc, s) => acc + s.exercises.reduce((sum, e) => sum + e.sets.length, 0), 0);
  const avgWeeklySets = Math.round(totalSets / Math.max(1, weeklyFrequency > 0 ? 4 : 1));

  if (avgWeeklySets > 0 && avgWeeklySets < 18 && validSessions.length >= 3) {
    issues.push({
      id: 'low_volume',
      category: 'volume',
      severity: 'warning',
      title: 'حجم کل ست‌های کاری کمتر از حد بهینه',
      explanation: `مجموع ست‌های کاری شاگرد در هفته به طور میانگین ${avgWeeklySets} ست است که برای کل عضلات بدن کمتر از حداقل حجم مؤثر (MEV) است.`,
      recommendation: 'افزودن ۲ تا ۳ ست کاری به حرکات کلیدی چندمفصلی برای دستیابی به حجم بهینه ۱۰ الی ۲۰ ست برای هر عضله در هفته.',
    });
  }

  // 5. Recovery & Biometric Resting Heart Rate
  let restingHrStatus: 'normal' | 'elevated' | 'not_recorded' = 'not_recorded';
  if (biometrics?.restingHr) {
    if (biometrics.restingHr >= 78) {
      restingHrStatus = 'elevated';
      issues.push({
        id: 'elevated_rhr',
        category: 'recovery',
        severity: 'alert',
        title: 'ضربان استراحت بالا؛ احتمال خستگی سیستمیک یا کمبود ریکاوری',
        explanation: `ضربان قلب در حالت استراحت (${biometrics.restingHr} bpm) بالاست. این شاخص در کنار عدم پیشرفت، نشان‌دهنده استرس بدنی بالا، کمبود خواب یا بیش‌تمرینی است.`,
        recommendation: 'یک هفته دیلود (Deload) با کاهش ۵۰ درصدی ست‌ها تجویز کنید و ساعت خواب شبانه شاگرد را پایش نمایید.',
      });
    } else {
      restingHrStatus = 'normal';
    }
  }

  // 6. Orthopedic & Medical Limitations
  if (biometrics?.limitations && biometrics.limitations.trim().length > 3) {
    issues.push({
      id: 'orthopedic_limitations',
      category: 'orthopedic',
      severity: 'info',
      title: 'محدودیت یا آسیب فیزیکی ثبت‌شده',
      explanation: `محدودیت ثبت‌شده: «${biometrics.limitations}». تمرینات باید با فیزیولوژی و آسیب مفاصل شاگرد همخوان باشند.`,
      recommendation: 'ماژول Hinge Health را برای تمرینات اصلاحی مفاصل فعال کرده و از حرکات جایگزین بدون درد استفاده کنید.',
    });
  }

  // 7. Nutrition Targets
  if (options?.nutritionTargets?.proteinG && options.nutritionTargets.proteinG < 80) {
    issues.push({
      id: 'low_protein_target',
      category: 'nutrition',
      severity: 'warning',
      title: 'هدف پروتئین روزانه ناکافی است',
      explanation: 'برای رشد عضلانی یا حفظ بافت در رژیم، مصرف پروتئین شاگرد باید حداقل ۱٫۶ الی ۲٫۲ گرم به ازای هر کیلوگرم وزن باشد.',
      recommendation: 'برنامه غذایی شاگرد را اصلاح کرده و مصرف منابع پروتئینی زودجذب را افزایش دهید.',
    });
  }

  // Summary evaluation
  let overallStatus: 'needs_attention' | 'optimal' | 'plateau' = 'optimal';
  let statusLabel = 'روند مطلوب و پیش‌رونده';
  let statusColor = '#10b981';
  let summaryHeadline = 'شاگرد مسیر پیشرفت را به درستی طی می‌کند';
  let summaryText = 'جلسات به صورت پیوسته ثبت شده و شاخص‌های اضافه‌بار و ریکاوری در وضعیت مساعد قرار دارند.';

  const hasHighSeverity = issues.some((i) => i.severity === 'alert');
  const hasMediumSeverity = issues.some((i) => i.severity === 'warning');

  if (hasHighSeverity) {
    overallStatus = 'needs_attention';
    statusLabel = 'نیاز به مداخله فوری مربی';
    statusColor = '#ef4444';
    summaryHeadline = 'علت عدم نتیجه‌گیری شاگرد شناسایی شد';
    summaryText = 'توقف اضافه‌بار تدریجی، ناپیوستگی در جلسات، یا خستگی سیستمیک مانع رشد شاگرد شده است. موارد زیر را اصلاح کنید.';
  } else if (hasMediumSeverity) {
    overallStatus = 'plateau';
    statusLabel = 'احتمال ورود به فلات';
    statusColor = '#f59e0b';
    summaryHeadline = 'پتانسیل بهینه‌سازی برنامه و ست‌ها';
    summaryText = 'شاگرد پیشرفت دارد اما با اصلاح شدت ست‌ها (RIR) یا حجم هفتگی، نتایج بسیار چشمگیرتری حاصل خواهد شد.';
  }

  return {
    overallStatus,
    statusLabel,
    statusColor,
    summaryHeadline,
    summaryText,
    issues,
    metrics: {
      totalSessionsAnalyzed: validSessions.length,
      weeklyFrequency,
      progressiveOverloadTrend: overloadTrend,
      overloadChangePercent,
      avgRir,
      avgWeeklySets,
      restingHrStatus,
    },
  };
}
