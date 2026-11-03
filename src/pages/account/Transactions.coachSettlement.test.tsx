import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 0; } }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ user: { id: 5, role: 'coach', status: 'ready' } }) }));
vi.mock('../../components/PaymentPractice', () => ({ PaymentPractice: () => null }));
import { CoachTransactions } from './Transactions';

const settlement = {
  coachId: 5,
  coachName: 'مربیِ باشگاه',
  iban: 'IR820540102680020817909002',
  programmeShareTomans: 90000,
  referralShareTomans: 9900,
  earnedTomans: 99900,
  paidTomans: 50000,
  owedTomans: 49900,
  payments: [{ id: 1, coachId: 5, amountTomans: 50000, reference: '11223344', note: 'واریز شبا', paidAt: '2026-11-01T08:00:00.000Z', createdAt: '2026-11-01T08:00:00.000Z' }],
};

beforeEach(() => {
  mocks.api.mockReset();
  mocks.api.mockImplementation((_method: string, path: string) => {
    if (path === '/coach/iban') return Promise.resolve({ iban: 'IR820540102680020817909002' });
    if (path === '/coach/transactions') return Promise.resolve({ transactions: [], subscriptionShares: [], settlement });
    return Promise.resolve({});
  });
});
afterEach(cleanup);

it('shows the coach what they earned, what was paid and what is left', async () => {
  render(<MemoryRouter><CoachTransactions /></MemoryRouter>);

  expect(await screen.findByText('تسویهٔ حساب شما')).toBeInTheDocument();
  expect(screen.getByText('کسب‌شده').closest('.financial-report__metric')?.textContent).toContain('۹۹٬۹۰۰');
  expect(screen.getByText('پرداخت‌شده', { selector: '.account-muted' }).closest('.financial-report__metric')?.textContent).toContain('۵۰٬۰۰۰');
  expect(screen.getByText('ماندهٔ طلب شما').closest('.financial-report__metric')?.textContent).toContain('۴۹٬۹۰۰');
  // The transfer the club made is on the record of the coach.
  expect(screen.getByText('پرداخت به شما').closest('article')?.textContent).toContain('۵۰٬۰۰۰ تومان');
});

it('says when nothing has been paid yet', async () => {
  mocks.api.mockImplementation((_method: string, path: string) => {
    if (path === '/coach/iban') return Promise.resolve({ iban: null });
    if (path === '/coach/transactions') return Promise.resolve({ transactions: [], subscriptionShares: [], settlement: { ...settlement, paidTomans: 0, owedTomans: 99900, payments: [] } });
    return Promise.resolve({});
  });
  render(<MemoryRouter><CoachTransactions /></MemoryRouter>);

  expect(await screen.findByText('هنوز پرداختی برای شما ثبت نشده است.')).toBeInTheDocument();
});
