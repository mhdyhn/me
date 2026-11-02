import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PremiumGate } from './PremiumGate';
import { clearPlanCache } from '../lib/plans';

const session = vi.hoisted(() => ({ user: null as any }));

vi.mock('../context/SessionContext', () => ({
  useSession: () => ({ user: session.user }),
}));

const independentStudent = {
  id: 5, username: 'student', displayName: 'شاگرد', role: 'student',
  coachId: null, mustChangePassword: false, selfRegistered: true,
  coachAccess: true, personalProgramMode: false,
};

const sent: string[] = [];

function stubApi(handlers: Record<string, unknown>) {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input).replace(/^.*\/api/, '');
    sent.push(path);
    const handler = handlers[path];
    return new Response(JSON.stringify(handler ?? { error: 'unexpected request' }), {
      status: handler === undefined ? 404 : 200, headers: { 'Content-Type': 'application/json' },
    });
  }));
}

function plan(features: string[], planId = 'free') {
  return {
    planId,
    plan: { id: planId, title: 'پلن رایگان', tagline: '', priceTomans: 0, periodDays: null, audience: 'independent', features: [] },
    features,
    subscriptionActive: false,
    expiresAt: null,
    daysLeft: 0,
    priceTomans: 99000,
    cardTransferAvailable: true,
    plans: [
      { id: 'independent', title: 'پلن استقلال', tagline: 'برای شاگرد بدون مربی', priceTomans: 99000, periodDays: 30, audience: 'independent', features: [{ key: 'smart_program', label: 'برنامه‌ساز هوشمند' }] },
      { id: 'coach', title: 'پلن همراه مربی', tagline: 'برای شاگردی با مربی', priceTomans: 0, periodDays: null, audience: 'coach', features: [{ key: 'coach_program', label: 'برنامهٔ تمرینی مربی' }] },
    ],
  };
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE', '');
  session.user = independentStudent;
  clearPlanCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the paywall of the smart parts', () => {
  it('locks a part that the plan of an independent student does not open', async () => {
    stubApi({
      '/me/plan': plan(['exercise_guide', 'progress_report']),
      '/me/subscription': { priceTomans: 99000, active: false, expiresAt: null, daysLeft: 0, referralCoachName: null, cardTransferAvailable: true },
    });
    render(<PremiumGate feature="تغذیهٔ هوشمند" featureKey="nutrition" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('تغذیهٔ هوشمند برای شاگرد مستقل')).toBeTruthy());
    expect(screen.queryByText('محتوای بخش')).toBeNull();
    expect(sent).toContain('/me/plan');
    // The difference between the plans is shown.
    expect(screen.getByText('پلن استقلال')).toBeTruthy();
    expect(screen.getByText('پلن همراه مربی')).toBeTruthy();
  });

  it('opens the part when the subscription puts the student on the independent plan', async () => {
    stubApi({
      '/me/plan': plan(['exercise_guide', 'progress_report', 'nutrition', 'ai_hub', 'smart_program'], 'independent'),
      '/me/subscription': { priceTomans: 99000, active: true, expiresAt: '2026-11-30T08:00:00.000Z', daysLeft: 30, referralCoachName: null, cardTransferAvailable: true },
    });
    render(<PremiumGate feature="تغذیهٔ هوشمند" featureKey="nutrition" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('محتوای بخش')).toBeTruthy());
    expect(screen.queryByText('تغذیهٔ هوشمند برای شاگرد مستقل')).toBeNull();
  });

  it('waits for the plan instead of selling a plan to somebody who already has one', async () => {
    stubApi({
      '/me/subscription': { priceTomans: 99000, active: true, expiresAt: '2026-11-30T08:00:00.000Z', daysLeft: 30, referralCoachName: null, cardTransferAvailable: true },
    });
    render(<PremiumGate feature="تغذیهٔ هوشمند" featureKey="nutrition" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText(/پلن شما بارگذاری نشد/)).toBeTruthy());
    // No purchase box and no locked content: the answer is not known yet.
    expect(screen.queryByText('پلن استقلال')).toBeNull();
    expect(screen.queryByText('محتوای بخش')).toBeNull();
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeTruthy();
  });

  it('keeps the smart parts open for a student whose coach defines the programme', async () => {
    session.user = { ...independentStudent, coachId: 4, personalProgramMode: false };
    stubApi({
      '/me/plan': plan(['exercise_guide', 'progress_report', 'coach_program', 'coach_nutrition', 'coach_chat', 'nutrition', 'ai_hub'], 'coach'),
      '/me/subscription': { priceTomans: 99000, active: false, expiresAt: null, daysLeft: 0, referralCoachName: null, cardTransferAvailable: true },
    });
    render(<PremiumGate feature="تغذیهٔ هوشمند" featureKey="nutrition" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('محتوای بخش')).toBeTruthy());
    expect(sent).toContain('/me/plan');
  });
});
