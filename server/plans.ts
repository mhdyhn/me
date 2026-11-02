/**
 * The plans of the club.
 *
 * The club sells two different things and the difference is not cosmetic:
 *
 * - «پلن همراه مربی» belongs to a student whose coach wrote the training and the
 *   nutrition programme. The coach was paid for the programme, so this plan is free and
 *   opens the coach's programme, the coach's nutrition plan, the chat with the coach,
 *   the progress report, the exercise guide and the smart features.
 * - «پلن استقلال» belongs to a student without a coach. Nobody wrote a programme for
 *   this student, so the plan has to open the parts that replace a coach: the smart
 *   programme builder, the personal nutrition planner, the health AI and the workout.
 *   This plan costs 99,000 tomans a month.
 * - «رایگان» is the state of an independent student before they subscribe: the exercise
 *   guide and the progress report, nothing that needs a plan.
 *
 * The entitlements live on the server. The client asks which features are open, so a
 * student can never unlock a part of the app by changing the phone.
 */
import type { StoredUser } from './users.ts';

export type PlanId = 'free' | 'coach' | 'independent';

export type FeatureKey =
  /** The exercise library with the pictures and the execution guide. */
  | 'exercise_guide'
  /** The written progress report of the last 30 days. */
  | 'progress_report'
  /** The training programme the coach sold. */
  | 'coach_program'
  /** The nutrition programme the coach wrote. */
  | 'coach_nutrition'
  /** The chat with the coach. */
  | 'coach_chat'
  /** The smart programme builder and the personal programme editor. */
  | 'smart_program'
  /** The personal nutrition planner: goals, diary and notes. */
  | 'nutrition'
  /** The health and performance AI. */
  | 'ai_hub';

export interface PlanFeature {
  key: FeatureKey;
  label: string;
}

export interface Plan {
  id: PlanId;
  title: string;
  tagline: string;
  /** The price in tomans; the free plans cost nothing. */
  priceTomans: number;
  /** The length of one paid period in days; null means it never ends. */
  periodDays: number | null;
  /** Who this plan is meant for. */
  audience: 'everyone' | 'coach' | 'independent';
  features: PlanFeature[];
}

const FEATURES = {
  exercise_guide: { key: 'exercise_guide', label: 'کتابخانهٔ حرکت‌ها با راهنمای اجرا' },
  progress_report: { key: 'progress_report', label: 'گزارش پیشرفت ۳۰ روزه' },
  coach_program: { key: 'coach_program', label: 'برنامهٔ تمرینی مربی' },
  coach_nutrition: { key: 'coach_nutrition', label: 'برنامهٔ غذایی مربی' },
  coach_chat: { key: 'coach_chat', label: 'گفتگو با مربی' },
  smart_program: { key: 'smart_program', label: 'برنامه‌ساز هوشمند و ویرایش برنامهٔ شخصی' },
  nutrition: { key: 'nutrition', label: 'تغذیهٔ هوشمند (هدف، دفتر خوراک، یادداشت)' },
  ai_hub: { key: 'ai_hub', label: 'اکوسیستم هوش سلامتی و عملکرد' },
} as const satisfies Record<FeatureKey, PlanFeature>;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    title: 'پلن رایگان',
    tagline: 'برای شاگرد مستقلی که هنوز اشتراک نگرفته است.',
    priceTomans: 0,
    periodDays: null,
    audience: 'independent',
    features: [FEATURES.exercise_guide, FEATURES.progress_report],
  },
  coach: {
    id: 'coach',
    title: 'پلن همراه مربی',
    tagline: 'برای شاگردی که مربی برنامهٔ تمرینی و غذایی او را نوشته است.',
    priceTomans: 0,
    periodDays: null,
    audience: 'coach',
    features: [
      FEATURES.exercise_guide,
      FEATURES.progress_report,
      FEATURES.coach_program,
      FEATURES.coach_nutrition,
      FEATURES.coach_chat,
      FEATURES.nutrition,
      FEATURES.ai_hub,
    ],
  },
  independent: {
    id: 'independent',
    title: 'پلن استقلال',
    tagline: 'برای شاگردی که مربی ندارد و می‌خواهد خودش برنامه داشته باشد.',
    priceTomans: 99_000,
    periodDays: 30,
    audience: 'independent',
    features: [
      FEATURES.exercise_guide,
      FEATURES.progress_report,
      FEATURES.smart_program,
      FEATURES.nutrition,
      FEATURES.ai_hub,
    ],
  },
};

/** The plans a student can pick from, in the order the paywall shows them. */
export const PAID_PLAN_IDS: PlanId[] = ['independent', 'coach'];

/** Whether the student still follows a coach's programme. */
export function hasCoachProgramme(user: Pick<StoredUser, 'role' | 'coachId' | 'personalProgramMode'>): boolean {
  if (user.role !== 'student') return false;
  return user.coachId !== null && user.personalProgramMode !== true;
}

/**
 * The plan of an account.
 *
 * A student with a coach's programme is on the coach plan. An independent student is on
 * the paid plan while the subscription runs and on the free plan otherwise.
 */
export function planIdForUser(
  user: Pick<StoredUser, 'role' | 'coachId' | 'personalProgramMode'>,
  subscriptionActive: boolean
): PlanId {
  // A coach and a manager work inside the club: they use every part and buy no plan.
  if (user.role !== 'student') return 'coach';
  if (hasCoachProgramme(user)) return 'coach';
  if (subscriptionActive) return 'independent';
  return 'free';
}

/** The features the plan opens. */
export function featuresForPlan(planId: PlanId): FeatureKey[] {
  return PLANS[planId].features.map((feature) => feature.key);
}

/** The features that are open for this account right now. */
export function unlockedFeatures(
  user: Pick<StoredUser, 'role' | 'coachId' | 'personalProgramMode'>,
  subscriptionActive: boolean
): FeatureKey[] {
  const planId = planIdForUser(user, subscriptionActive);
  const features = featuresForPlan(planId);
  if (user.role !== 'student') {
    // A coach and a manager use every part of the club; they never buy a plan.
    return [...new Set([...features, ...featuresForPlan('independent')])];
  }
  return features;
}

/** Whether one feature is open for this account. */
export function hasFeature(
  user: Pick<StoredUser, 'role' | 'coachId' | 'personalProgramMode'>,
  subscriptionActive: boolean,
  feature: FeatureKey
): boolean {
  return unlockedFeatures(user, subscriptionActive).includes(feature);
}
