import { useEffect, useMemo, useState } from 'react';
import { Lock, Sparkles, TrendingUp } from 'lucide-react';
import { useGym } from '../context/GymProvider';
import { useSession } from '../context/SessionContext';
import { getSessionTotals, getWeekComparison, getWeeklyTotals } from '../lib/analytics';
import { faNumber, formatDate, kg } from '../lib/format';
import { loadSubscription, type SubscriptionState } from '../lib/subscription';
import { SubscriptionCheckout } from './SubscriptionCheckout';

const THIRTY_DAYS = 30 * 86_400_000;

/**
 * The first smart feature behind the optional subscription: a written progress report for
 * the last 30 days. Without the subscription the report stays locked and the student can
 * buy one month with card-to-card.
 */
export function SmartProgressReport() {
  const { sessions, bodyweights } = useGym();
  const { user } = useSession();
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadSubscription().then((result) => {
      if (cancelled) return;
      setState(result);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

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

  // The subscription is a student feature; coaches and admins keep the free tools.
  if (loading || user?.role !== 'student') return null;

  return (
    <section className="smart-report" aria-label="گزارش هوشمند پیشرفت">
      <header className="smart-report__head">
        <span className="eyebrow"><Sparkles size={14} /> گزارش هوشمند ۳۰ روز</span>
        {state?.active && <span className="smart-report__badge">فعال تا {state.expiresAt ? formatDate(new Date(state.expiresAt), { month: 'long', day: 'numeric' }) : '—'}</span>}
      </header>

      {state?.active ? (
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
      ) : (
        <div className="smart-report__locked">
          <p>
            <Lock size={15} /> گزارش هوشمند پیشرفت با اشتراک ماهانهٔ {faNumber(state?.priceTomans ?? 99_000)} تومان باز می‌شود:
            خلاصهٔ ۳۰ روز، حجم تمرین، روند وزن و مقایسه با هفتهٔ قبل.
          </p>
          {state?.cardTransferAvailable === false ? (
            <p className="account-muted">خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.</p>
          ) : (
            <SubscriptionCheckout priceTomans={state?.priceTomans ?? 99_000} onActivated={(next) => setState(next)} />
          )}
        </div>
      )}
    </section>
  );
}
