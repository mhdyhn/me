import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PlanCard } from './PlanCard';
import { clearPlanCache } from '../lib/plans';

const session = vi.hoisted(() => ({ user: null as any }));

vi.mock('../context/SessionContext', () => ({
  useSession: () => ({ user: session.user }),
}));

const student = {
  id: 5, username: 'student', displayName: 'شاگرد', role: 'student',
  coachId: null, mustChangePassword: false, selfRegistered: true,
  coachAccess: true, personalProgramMode: false,
};

function stubPlan(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE', '');
  session.user = student;
  clearPlanCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the plan card of the student', () => {
  it('shows the plan of the account and the other plans with their prices', async () => {
    stubPlan({
      planId: 'pro',
      plan: { id: 'pro', title: 'پلن حرفه‌ای', tagline: 'برنامه و تغذیه', priceTomans: 99000, periodDays: 30, audience: 'independent', features: [{ key: 'smart_program', label: 'برنامه‌ساز هوشمند' }] },
      features: ['smart_program', 'nutrition'],
      subscriptionActive: true,
      expiresAt: '2026-11-30T08:00:00.000Z',
      daysLeft: 30,
      priceTomans: 99000,
      cardTransferAvailable: true,
      plans: [
        { id: 'basic', title: 'پلن پایه', tagline: '', priceTomans: 49000, periodDays: 30, audience: 'independent', features: [] },
        { id: 'pro', title: 'پلن حرفه‌ای', tagline: '', priceTomans: 99000, periodDays: 30, audience: 'independent', features: [] },
        { id: 'full', title: 'پلن کامل', tagline: '', priceTomans: 149000, periodDays: 30, audience: 'independent', features: [] },
      ],
    });

    render(<PlanCard />);
    await waitFor(() => expect(screen.getByText('پلن حرفه‌ای')).toBeTruthy());
    // The other plans are compared with the price the club charges today.
    expect(screen.getByText('پلن پایه')).toBeTruthy();
    expect(screen.getByText('پلن کامل')).toBeTruthy();
    expect(screen.getByText(/۱۴۹٬۰۰۰/)).toBeTruthy();
    expect(screen.getByText(/۳۰ روز از اشتراک فعلی باقی مانده/)).toBeTruthy();
  });

  it('lets an independent student open the checkout of another plan', async () => {
    stubPlan({
      planId: 'basic',
      plan: { id: 'basic', title: 'پلن پایه', tagline: 'برنامه‌ساز هوشمند', priceTomans: 49000, periodDays: 30, audience: 'independent', features: [{ key: 'smart_program', label: 'برنامه‌ساز هوشمند' }] },
      features: ['smart_program'],
      subscriptionActive: true,
      expiresAt: '2026-11-30T08:00:00.000Z',
      daysLeft: 30,
      priceTomans: 49000,
      cardTransferAvailable: true,
      plans: [
        { id: 'basic', title: 'پلن پایه', tagline: '', priceTomans: 49000, periodDays: 30, audience: 'independent', features: [] },
        { id: 'pro', title: 'پلن حرفه‌ای', tagline: '', priceTomans: 99000, periodDays: 30, audience: 'independent', features: [] },
        { id: 'full', title: 'پلن کامل', tagline: '', priceTomans: 149000, periodDays: 30, audience: 'independent', features: [] },
      ],
    });

    render(<PlanCard />);
    await waitFor(() => expect(screen.getByText('پلن پایه')).toBeTruthy());
    // The student picks the middle plan and the checkout opens right here.
    fireEvent.click(screen.getByRole('button', { name: /پلن حرفه‌ای/ }));
    expect(await screen.findByText(/اشتراک ماهانهٔ/)).toBeTruthy();
    // The plan the student picked is named in the checkout, next to its price.
    expect(screen.getAllByText(/پلن حرفه‌ای/).length).toBeGreaterThan(1);
    // The price of the chosen plan is shown on the button and in the checkout.
    expect(screen.getAllByText(/۹۹٬۰۰۰/).length).toBeGreaterThanOrEqual(2);
  });

  it('shows nothing to a coach', async () => {
    session.user = { ...student, role: 'coach' };
    stubPlan({ planId: 'coach', plan: { id: 'coach', title: 'پلن همراه مربی', tagline: '', priceTomans: 0, periodDays: null, audience: 'coach', features: [] }, features: [], subscriptionActive: false, expiresAt: null, daysLeft: 0, priceTomans: 0, cardTransferAvailable: true, plans: [] });
    const { container } = render(<PlanCard />);
    await waitFor(() => expect(container.querySelector('.plan-card')).toBeNull());
  });
});
