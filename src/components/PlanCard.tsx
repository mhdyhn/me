import { useEffect, useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { loadPlan, type PlanState } from '../lib/plans';
import { faNumber } from '../lib/format';

/**
 * The plan of the account.
 *
 * The two students of the club are not on the same plan: a student with a coach has the
 * coach's training and nutrition programme, an independent student opens the smart parts
 * with the monthly plan. The card says plainly which one is open.
 */
export function PlanCard() {
  const { user } = useSession();
  const [plan, setPlan] = useState<PlanState | null>(null);

  useEffect(() => {
    void loadPlan().then(setPlan);
  }, []);

  // The plan belongs to the student. A coach and a manager use every part of the club.
  if (!plan || !plan.plan || user?.role !== 'student') return null;

  const price = plan.plan.priceTomans === 0
    ? 'رایگان'
    : `${faNumber(plan.plan.priceTomans)} تومان در ماه`;

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
      {plan.plans.length > 0 && (
        <div className="plan-card__others">
          <span className="field-hint">پلن‌های دیگر:</span>
          {plan.plans.filter((item) => item.id !== plan.planId).map((item) => (
            <span key={item.id} className="plan-card__other">
              <strong>{item.title}</strong> — {item.priceTomans === 0 ? 'رایگان' : `${faNumber(item.priceTomans)} تومان در ماه`}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
