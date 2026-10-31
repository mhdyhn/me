import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PremiumGate } from './PremiumGate';

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

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE', '');
  session.user = independentStudent;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('the smart-feature paywall', () => {
  it('locks the smart features for an independent student without a subscription', async () => {
    stubApi({ '/me/subscription': { priceTomans: 99000, active: false, expiresAt: null, daysLeft: 0, referralCoachName: null, cardTransferAvailable: true } });
    render(<PremiumGate feature="تغذیهٔ هوشمند" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('تغذیهٔ هوشمند برای شاگرد مستقل')).toBeTruthy());
    expect(screen.queryByText('محتوای بخش')).toBeNull();
    expect(sent).toContain('/me/subscription');
  });

  it('opens the smart features when the subscription is active', async () => {
    stubApi({ '/me/subscription': { priceTomans: 99000, active: true, expiresAt: '2026-11-30T08:00:00.000Z', daysLeft: 30, referralCoachName: null, cardTransferAvailable: true } });
    render(<PremiumGate feature="تغذیهٔ هوشمند" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('محتوای بخش')).toBeTruthy());
    expect(screen.queryByText('تغذیهٔ هوشمند برای شاگرد مستقل')).toBeNull();
  });

  it('keeps the smart features free for a student whose coach defines the programme', async () => {
    session.user = { ...independentStudent, coachId: 4, personalProgramMode: false };
    stubApi({});
    render(<PremiumGate feature="تغذیهٔ هوشمند" title="تغذیهٔ هوشمند برای شاگرد مستقل" description="شرح امکانات"><p>محتوای بخش</p></PremiumGate>);
    await waitFor(() => expect(screen.getByText('محتوای بخش')).toBeTruthy());
    expect(sent).not.toContain('/me/subscription');
  });
});
