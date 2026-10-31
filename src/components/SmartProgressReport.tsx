import { useMemo } from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';
import { useGym } from '../context/GymProvider';
import { getSessionTotals, getWeekComparison, getWeeklyTotals } from '../lib/analytics';
import { faNumber, formatDate, kg } from '../lib/format';

const THIRTY_DAYS = 30 * 86_400_000;

/**
 * A written progress report for the last 30 days. It is free for everyone: the progress
 * data already belongs to the student.
 */
export function SmartProgressReport() {
  const { sessions, bodyweights } = useGym();

  const report = useMemo(() => {
    const now = Date.now();
    const from = now - THIRTY_DAYS;
    const recent = sessions.filter((session) => {
      if (session.status !== 'completed') return false;
      const time = new Date(session.completedAt || session.startedAt).getTime();
      return time >= from && time <= now;
    });
    const totals = recent.reduce((sum, session) => {
      const sessionTotals = getSessionTotals(session);
      return {
        volumeKg: sum.volumeKg + sessionTotals.volumeKg,
        setCount: sum.setCount + sessionTotals.setCount,
        repCount: sum.repCount + sessionTotals.repCount,
        durationSeconds: sum.durationSeconds + sessionTotals.durationSeconds,
      };
    }, { volumeKg: 0, setCount: 0, repCount: 0, durationSeconds: 0 });
    const weeks = getWeeklyTotals(sessions, 6);
    const comparison = getWeekComparison(weeks);
    const weights = bodyweights
      .map((entry) => ({ date: entry.date, weightKg: entry.weightKg }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = weights[0] ?? null;
    const last = weights.at(-1) ?? null;
    return {
      sessionCount: recent.length,
      ...totals,
      volumeChangePercent: comparison?.volumeChangePercent ?? null,
      weightChangeKg: first && last ? last.weightKg - first.weightKg : null,
      firstWeightKg: first?.weightKg ?? null,
      lastWeightKg: last?.weightKg ?? null,
      lastWeightDate: last?.date ?? null,
    };
  }, [sessions, bodyweights]);

  return (
    <section className="smart-report" aria-label="گزارش هوشمند پیشرفت">
      <header className="smart-report__head">
        <span className="eyebrow"><Sparkles size={14} /> گزارش هوشمند ۳۰ روز</span>
        <span className="smart-report__badge">رایگان</span>
      </header>

      <div className="smart-report__grid">
          <div className="smart-report__cell">
            <span>جلسهٔ کامل‌شده</span>
            <b>{faNumber(report.sessionCount)}</b>
          </div>
          <div className="smart-report__cell">
            <span>حجم تمرین</span>
            <b>{kg(report.volumeKg)}</b>
          </div>
          <div className="smart-report__cell">
            <span>ست و تکرار</span>
            <b>{faNumber(report.setCount)} · {faNumber(report.repCount)}</b>
          </div>
          <div className="smart-report__cell">
            <span>زمان تمرین</span>
            <b>{faNumber(Math.round(report.durationSeconds / 60))} دقیقه</b>
          </div>
          {report.volumeChangePercent !== null && (
            <div className="smart-report__cell">
              <span>تغییر حجم نسبت به هفتهٔ قبل</span>
              <b><TrendingUp size={14} /> {faNumber(Math.round(report.volumeChangePercent))}٪</b>
            </div>
          )}
          {report.weightChangeKg !== null && (
            <div className="smart-report__cell">
              <span>تغییر وزن ثبت‌شده</span>
              <b>{report.weightChangeKg > 0 ? '+' : ''}{faNumber(Number(report.weightChangeKg.toFixed(1)))} کیلوگرم</b>
              <small>{report.lastWeightDate ? `آخرین ثبت: ${formatDate(new Date(report.lastWeightDate), { month: 'long', day: 'numeric' })}` : null}</small>
            </div>
          )}
      </div>
    </section>
  );
}
