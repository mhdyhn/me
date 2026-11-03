import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 0; } }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ user: { id: 7, role: 'admin' } }) }));
vi.mock('../../components/PaymentPractice', () => ({ PaymentPractice: () => null }));
import { AdminTransactions } from './Transactions';

const subscription = {
  id: 3,
  studentId: 12,
  studentName: 'شاگردِ مستقل',
  plan: 'pro',
  amountTomans: 99000,
  coachShareTomans: 9900,
  adminShareTomans: 89100,
  coachName: 'مربیِ معرف',
  status: 'active',
  trackingNumber: '11223344',
  createdAt: '2026-11-01T08:00:00.000Z',
  expiresAt: '2026-12-01T08:00:00.000Z',
};

beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);

it('shows the income of the subscriptions and counts it in the totals of the club', async () => {
  mocks.api.mockResolvedValue({ transactions: [], subscriptionPayments: [subscription] });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  expect(await screen.findByText('اشتراک‌های هوشمند')).toBeInTheDocument();
  // The referral share is money the club owes to the coach, so it has to be visible.
  expect(screen.getByText('سهم مربی معرف: ۹٬۹۰۰ تومان')).toBeInTheDocument();
  expect(screen.getByText('سهم باشگاه: ۸۹٬۱۰۰ تومان')).toBeInTheDocument();
  const row = screen.getByText('سهم مربی معرف: ۹٬۹۰۰ تومان').closest('article');
  expect(row?.textContent).toContain('شاگردِ مستقل');
  expect(row?.textContent).toContain('معرفی‌شده توسط: مربیِ معرف');
  // The totals of the club include the subscriptions.
  await waitFor(() => expect(screen.getByText('کل مبلغ').parentElement?.textContent).toContain('۹۹٬۰۰۰'));
  expect(screen.getByText('سهم باشگاه').parentElement?.textContent).toContain('۸۹٬۱۰۰');
  expect(screen.getByText('سهم مربیان').parentElement?.textContent).toContain('۹٬۹۰۰');
  expect(screen.getByText('تراکنش‌های موفق').parentElement?.textContent).toContain('۱');
});

it('keeps a month that has ended in the books and marks it as finished', async () => {
  mocks.api.mockResolvedValue({
    transactions: [],
    subscriptionPayments: [{ ...subscription, id: 4, status: 'expired', expiresAt: '2026-11-20T08:00:00.000Z' }],
  });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  // The money arrived when the month started, so it stays in the totals of the club.
  await waitFor(() => expect(screen.getByText('کل مبلغ').parentElement?.textContent).toContain('۹۹٬۰۰۰'));
  expect(screen.getByText('دوره تمام شده')).toBeInTheDocument();
});

it('does not show a subscription section when there is no subscription yet', async () => {
  mocks.api.mockResolvedValue({ transactions: [], subscriptionPayments: [] });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  expect(await screen.findByText('گزارش مالی')).toBeInTheDocument();
  expect(screen.queryByText('اشتراک‌های هوشمند')).not.toBeInTheDocument();
  expect(screen.getByText('هنوز تراکنشی ثبت نشده است.')).toBeInTheDocument();
});
