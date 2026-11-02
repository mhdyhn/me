import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { loadPlan, type PlanState } from '../lib/plans';
import { faNumber } from '../lib/format';
import { SubscriptionCheckout } from './SubscriptionCheckout';

/**
 * The plan of the account.
 *
 * The students of the club are not on the same plan: a student with a coach has the
 * coach's training and nutrition programme, an independent student opens the smart parts
 * with the monthly plan. The card says plainly which one is open, and an independent
 * student can pick another paid plan right here.
 */
export function PlanCard() {
  const { user } = useSession();
  const [plan, setPlan] = useState<PlanState | null>(null);
  // The paid plan the student picked to change to; empty until he picks one.
  const [changing, setChanging] = useState<string | null>(null);

  useEffect(() => {
    void loadPlan().then(setPlan);
  }, []);

  // The plan belongs to the student. A coach and a manager use every part of the club.
  if (!plan || !plan.plan || user?.role !== 'student') return null;

  const price = plan.plan.priceTomans === 0
    ? 'رایگان'
    : `${faNumber(plan.plan.priceTomans)} تومان در ماه`;

  // The paid plans on sale, and the one the student may change to.
  const paidPlans = plan.plans.filter((item) => item.priceTomans > 0);
  const otherPlans = paidPlans.filter((item) => item.id !== plan.planId);
  const chosen = changing ? paidPlans.find((item) => item.id === changing) ?? null : null;

  return (
    <section className="panel-card plan-card" aria-label="پلن شما">
      <div className="card-topline">
        <div>
          <span className="eyebrow">پلن شما</span>
          <h3>{plan.plan.title}</h3>
        </div>
        <Sparkles size={18} className="icon-accent" />
      </div>
      <p className="muted small-text">{plan.plan.tagline}</p>
      <p className="plan-card__price">
        <strong>{price}</strong>
        {plan.subscriptionActive && plan.daysLeft > 0 && (
          <span>{faNumber(plan.daysLeft)} روز از اشتراک فعلی باقی مانده</span>
        )}
      </p>
      <ul className="plan-card__features">
        {plan.plan.features.map((feature) => (
          <li key={feature.key}><Check size={13} /> {feature.label}</li>
        ))}
      </ul>
      {otherPlans.length > 0 && (
        <div className="plan-card__others">
          <span className="field-hint">پلن‌های دیگر:</span>
          {otherPlans.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`plan-card__other${changing === item.id ? ' is-current' : ''}`}
              aria-pressed={changing === item.id}
              onClick={() => setChanging(changing === item.id ? null : item.id)}
            >
              <strong>{item.title}</strong> — {faNumber(item.priceTomans)} تومان در ماه
            </button>
          ))}
        </div>
      )}
      {chosen && (
        <SubscriptionCheckout
          planId={chosen.id}
          priceTomans={chosen.priceTomans}
          planTitle={chosen.title}
          onActivated={(next) => {
            setChanging(null);
            void loadPlan(true).then(setPlan);
            void next;
          }}
        />
      )}
      {otherPlans.length > 0 && !chosen && (
        <p className="account-muted plan-card__hint">
          پلن دیگری می‌خواهی؟ از بخش‌های پولیِ برنامه، پلن‌ها را ببین و همان را بخر.
        </p>
      )}
      {plan.planId === 'coach' && (
        <p className="account-muted plan-card__hint">
          برنامهٔ تمرینی و غذاییِ مربی برایت باز است؛ پلن دیگری لازم نیست.
        </p>
      )}
    </section>
  );
}
