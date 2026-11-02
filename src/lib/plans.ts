import { api } from './api';

export type PlanId = 'free' | 'coach' | 'independent';

export type FeatureKey =
  | 'exercise_guide'
  | 'progress_report'
  | 'coach_program'
  | 'coach_nutrition'
  | 'coach_chat'
  | 'smart_program'
  | 'nutrition'
  | 'ai_hub';

export interface PlanFeature {
  key: FeatureKey;
  label: string;
}

export interface Plan {
  id: PlanId;
  title: string;
  tagline: string;
  priceTomans: number;
  periodDays: number | null;
  audience: 'everyone' | 'coach' | 'independent';
  features: PlanFeature[];
}

export interface PlanState {
  planId: PlanId;
  plan: Plan;
  /** The features that are open right now. */
  features: FeatureKey[];
  subscriptionActive: boolean;
  expiresAt: string | null;
  daysLeft: number;
  priceTomans: number;
  cardTransferAvailable: boolean;
  /** The plans the paywall compares. */
  plans: Plan[];
}

let cached: PlanState | null = null;
let pending: Promise<PlanState | null> | null = null;

/** The plan of the signed-in account; the answer is cached for the session. */
export async function loadPlan(force = false): Promise<PlanState | null> {
  if (!force && cached) return cached;
  if (!force && pending) return pending;
  pending = api<PlanState>('GET', '/me/plan')
    .then((result) => {
      // Only a complete answer is worth caching; a half answer would break the paywall.
      if (!result || !result.plan || !Array.isArray(result.features)) return null;
      cached = result;
      return result;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}

/** Forgets the cached plan, for example right after a purchase. */
export function clearPlanCache(): void {
  cached = null;
}

/** Whether a feature is open in the given plan state. */
export function isFeatureOpen(state: PlanState | null, feature: FeatureKey): boolean {
  if (!state) return false;
  return state.features.includes(feature);
}

/** The label of a feature, for the plan comparison. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  exercise_guide: 'کتابخانهٔ حرکت‌ها با راهنمای اجرا',
  progress_report: 'گزارش پیشرفت ۳۰ روزه',
  coach_program: 'برنامهٔ تمرینی مربی',
  coach_nutrition: 'برنامهٔ غذایی مربی',
  coach_chat: 'گفتگو با مربی',
  smart_program: 'برنامه‌ساز هوشمند و ویرایش برنامهٔ شخصی',
  nutrition: 'تغذیهٔ هوشمند (هدف، دفتر خوراک، یادداشت)',
  ai_hub: 'اکوسیستم هوش سلامتی و عملکرد',
};
