import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: { id: 7, role: 'student' as const, coachId: null as number | null, personalProgramMode: false },
  loadSubscription: vi.fn(),
}));

vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock('../lib/subscription', () => ({
  loadSubscription: mocks.loadSubscription,
}));
vi.mock('../components/SubscriptionCheckout', () => ({ SubscriptionCheckout: () => <button type="button">خرید اشتراک</button> }));

import { ProgramSuggested } from './ProgramSuggested';

describe('the suggested programme page', () => {
  beforeEach(() => {
    mocks.user.coachId = null;
    mocks.user.personalProgramMode = false;
    mocks.loadSubscription.mockReset();
    mocks.loadSubscription.mockResolvedValue({ active: false, priceTomans: 99000, daysLeft: 0, expiresAt: null, referralCoachName: null, cardTransferAvailable: true });
  });
  afterEach(() => cleanup());

  it('asks an independent student to open the subscription', async () => {
    render(<MemoryRouter><ProgramSuggested /></MemoryRouter>);
    expect(await screen.findByText('برنامهٔ پیشنهادی برای شاگرد مستقل')).toBeInTheDocument();
    expect(screen.queryByText('هدف اصلی شما چیست؟')).not.toBeInTheDocument();
  });

  it('shows the questionnaire when the subscription is active', async () => {
    mocks.loadSubscription.mockResolvedValue({ active: true, priceTomans: 99000, daysLeft: 20, expiresAt: null, referralCoachName: null, cardTransferAvailable: true });
    render(<MemoryRouter><ProgramSuggested /></MemoryRouter>);
    expect(await screen.findByText('هدف اصلی شما چیست؟')).toBeInTheDocument();
    expect(screen.getByText('برنامهٔ ۳ روزه فول بادی (Full Body)')).toBeInTheDocument();
  });

  it('tells a student whose coach set the programme that the coach comes first', async () => {
    mocks.user.coachId = 3;
    render(<MemoryRouter><ProgramSuggested /></MemoryRouter>);
    expect(screen.getByText('برنامهٔ فعلی شما را مربی تعیین کرده است.')).toBeInTheDocument();
    expect(screen.queryByText('هدف اصلی شما چیست؟')).not.toBeInTheDocument();
    expect(mocks.loadSubscription).not.toHaveBeenCalled();
  });
});
