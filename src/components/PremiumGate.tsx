import { useEffect, useState, type ReactNode } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { loadSubscription, type SubscriptionState } from '../lib/subscription';
import { SubscriptionCheckout } from './SubscriptionCheckout';

/**
 * The paywall for the smart features.
 *
 * A student whose programme comes from a coach keeps everything free: the coach already
 * guides the training and the nutrition. An independent student (no coach programme) can
 * open the smart features with the optional monthly subscription.
 */
export function PremiumGate({
  feature,
  title,
  description,
  children,
}: {
  /** The name of the feature, used in the message. */
  feature: string;
  /** The heading of the locked panel. */
  title: string;
  /** What the subscription brings. */
  description: string;
  children: ReactNode;
}) {
  const { user } = useSession();
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);

  // Only an independent student needs the subscription.
  const needsSubscription = user?.role === 'student' && (user.coachId === null || user.personalProgramMode === true);

  useEffect(() => {
    if (!needsSubscription) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadSubscription().then((result) => {
      if (cancelled) return;
      setState(result);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [needsSubscription]);

  if (!needsSubscription) return <>{children}</>;
  if (loading) return null;

  if (state?.active) return <>{children}</>;

  return (
    <section className="premium-gate" aria-label={`${feature} با اشتراک`}>
      <span className="premium-gate__icon"><Lock size={18} /></span>
      <h2>{title}</h2>
      <p>{description}</p>
      <p className="account-muted">
        این بخش برای شاگردی است که برنامه‌اش را مربی تعیین نکرده و می‌خواهد خودش از امکانات هوشمند
        استفاده کند. با اشتراک ماهانهٔ {state?.priceTomans ? new Intl.NumberFormat('fa-IR').format(state.priceTomans) : '۹۹٬۰۰۰'} تومان باز می‌شود.
      </p>
      {state?.cardTransferAvailable === false ? (
        <p className="account-muted">خرید اشتراک با کارت‌به‌کارت هنوز فعال نشده است.</p>
      ) : (
        <SubscriptionCheckout priceTomans={state?.priceTomans ?? 99000} onActivated={(next) => setState(next)} />
      )}
      <p className="premium-gate__note"><Sparkles size={13} /> این پرداخت واقعی است و اشتراک بعد از تأیید خودکار رسید باز می‌شود.</p>
    </section>
  );
}
