import { useEffect, useState, type ReactNode } from 'react';
import { Check, Lock, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { clearPlanCache, loadPlan, type FeatureKey, type PlanState } from '../lib/plans';
import { loadSubscription, type SubscriptionState } from '../lib/subscription';
import { SubscriptionCheckout } from './SubscriptionCheckout';
import { faNumber } from '../lib/format';

/**
 * The paywall of the smart parts of the app.
 *
 * The plan of the account decides what is open. A student whose programme comes from a
 * coach keeps everything free: the coach already guides the training and the nutrition.
 * An independent student opens the smart parts with the monthly subscription, and the
 * panel shows the difference between the two plans.
 */
export function PremiumGate({
  feature,
  featureKey,
  title,
  description,
  children,
}: {
  /** The name of the feature, used in the message. */
  feature: string;
  /** The part of the app this gate protects. */
  featureKey: FeatureKey;
  /** The heading of the locked panel. */
  title: string;
  /** What the subscription brings. */
  description: string;
  children: ReactNode;
}) {
  const { user } = useSession();
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadPlan(attempt > 0), loadSubscription()]).then(([planResult, subscriptionResult]) => {
      if (cancelled) return;
      setPlan(planResult);
      setState(subscriptionResult);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [attempt]);

  // The coach and the manager use every part of the club and never buy a plan.
  const staff = user?.role === 'coach' || user?.role === 'admin';
  const open = staff || Boolean(plan?.features.includes(featureKey));

  if (loading) return null;
  if (open) return <>{children}</>;

  // The plan could not be read. Selling a plan to somebody who already has one is worse
  // than saying nothing, so the gate waits for a new answer instead.
  if (!plan) {
    return (
      <section className="premium-gate" aria-label={`${feature} با اشتراک`}>
        <span className="premium-gate__icon"><Lock size={18} /></span>
        <h2>{title}</h2>
        <p className="account-muted">پلن شما بارگذاری نشد؛ اتصال را بررسی کنید.</p>
        <button type="button" className="button button--secondary" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button>
      </section>
    );
  }

  const price = state?.priceTomans ?? plan.priceTomans ?? 99000;

  return (
    <section className="premium-gate" aria-label={`${feature} با اشتراک`}>
      <span className="premium-gate__icon"><Lock size={18} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="account-muted">
        این بخش برای شاگردی است که برنامه‌اش را مربی تعیین نکرده و می‌خواهد خودش از امکانات هوشمند
        استفاده کند. با اشتراک ماهانهٔ {faNumber(price)} تومان باز می‌شود.
      </p>
      {plan.plans.length > 0 && (
        <div className="premium-gate__plans" aria-label="تفاوت پلن‌ها">
          {plan.plans.map((item) => (
            <div key={item.id} className={`premium-gate__plan${item.id === plan.planId ? ' is-current' : ''}`}>
              <strong>{item.title}</strong>
              <span className="premium-gate__plan-price">
                {item.priceTomans === 0 ? 'رایگان' : `${faNumber(item.priceTomans)} تومان / ماه`}
              </span>
              <small>{item.tagline}</small>
              <ul>
                {item.features.map((itemFeature) => (
                  <li key={itemFeature.key}><Check size={12} /> {itemFeature.label}</li>
                ))}
              </ul>
              {item.id === plan.planId && <span className="premium-gate__plan-current">پلن فعلی شما</span>}
            </div>
          ))}
        </div>
      )}
      {state?.cardTransferAvailable === false || plan?.cardTransferAvailable === false ? (
        <p className="account-muted">خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.</p>
      ) : (
        <SubscriptionCheckout
          priceTomans={price}
          onActivated={(next) => {
            setState(next);
            clearPlanCache();
            void loadPlan(true).then((nextPlan) => setPlan(nextPlan));
          }}
        />
      )}
      <p className="premium-gate__note"><Sparkles size={13} /> این پرداخت واقعی است و اشتراک بعد از بررسیِ رسیدِ واریز باز می‌شود.</p>
    </section>
  );
}
