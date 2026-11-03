import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 0; } }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ user: { id: 7, role: 'admin' } }) }));
vi.mock('../../components/PaymentPractice', () => ({ PaymentPractice: () => null }));
import { AdminTransactions } from './Transactions';

const coachRow = {
  coachId: 4,
  coachName: 'مربیِ باشگاه',
  iban: 'IR820540102680020817909002',
  programmeShareTomans: 90000,
  referralShareTomans: 9900,
  earnedTomans: 99900,
  paidTomans: 50000,
  owedTomans: 49900,
  payments: [{ id: 1, coachId: 4, amountTomans: 50000, reference: '11223344', note: 'واریز شبا', paidAt: '2026-11-01T08:00:00.000Z', createdAt: '2026-11-01T08:00:00.000Z' }],
};

/** The page asks for the transactions and for the settlements; each gets its own answer. */
function routeApi(settlements: unknown, transactions: unknown = { transactions: [], subscriptionPayments: [] }) {
  mocks.api.mockImplementation((method: string, path: string) => {
    if (path === '/admin/settlements') return Promise.resolve(settlements);
    if (method === 'POST' && path === '/admin/settlements') return Promise.resolve({ settlement: { id: 2 } });
    return Promise.resolve(transactions);
  });
}

beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);

it('shows what every coach has earned, what was paid and what is left', async () => {
  routeApi({ settlements: [coachRow], totals: { earnedTomans: 99900, paidTomans: 50000, owedTomans: 49900 } });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  expect(await screen.findByText('تسویهٔ سهم مربیان')).toBeInTheDocument();
  const row = screen.getByText('مربیِ باشگاه').closest('article');
  expect(row?.textContent).toContain('سهم برنامه‌ها: ۹۰٬۰۰۰ تومان');
  expect(row?.textContent).toContain('سهم اشتراک معرفی‌شده: ۹٬۹۰۰ تومان');
  expect(row?.textContent).toContain('۴۹٬۹۰۰ تومان');
  expect(row?.textContent).toContain('IR820540102680020817909002');
  // The payment the club already made is on the record.
  expect(row?.textContent).toContain('۵۰٬۰۰۰ تومان');
  expect(row?.textContent).toContain('پیگیری 11223344');
  // The totals of the club.
  expect(screen.getByText('کل سهمِ کسب‌شده').parentElement?.textContent).toContain('۹۹٬۹۰۰');
  expect(screen.getByText('پرداخت‌شده').parentElement?.textContent).toContain('۵۰٬۰۰۰');
  expect(screen.getByText('ماندهٔ بدهی').parentElement?.textContent).toContain('۴۹٬۹۰۰');
});

it('records the transfer the manager made to the coach', async () => {
  const user = userEvent.setup();
  routeApi({ settlements: [coachRow], totals: { earnedTomans: 99900, paidTomans: 50000, owedTomans: 49900 } });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  await user.click(await screen.findByText('ثبت پرداخت به مربیِ باشگاه'));
  await user.type(screen.getByLabelText('مبلغ پرداخت (تومان)'), '۲۵۰۰۰');
  await user.click(screen.getByText('ثبت پرداخت', { selector: 'button[type="submit"]' }));

  await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/admin/settlements', expect.objectContaining({ coachId: 4, amountTomans: 25000 })));
});

it('does not accept an empty or broken amount', async () => {
  const user = userEvent.setup();
  routeApi({ settlements: [coachRow], totals: { earnedTomans: 99900, paidTomans: 50000, owedTomans: 49900 } });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  await user.click(await screen.findByText('ثبت پرداخت به مربیِ باشگاه'));
  await user.type(screen.getByLabelText('مبلغ پرداخت (تومان)'), 'abc');
  await user.click(screen.getByText('ثبت پرداخت', { selector: 'button[type="submit"]' }));

  expect(await screen.findByText('مبلغ پرداخت را به‌صورت عددِ مثبت بنویسید.')).toBeInTheDocument();
  expect(mocks.api).not.toHaveBeenCalledWith('POST', '/admin/settlements', expect.anything());
});

it('says that no coach has a share yet', async () => {
  routeApi({ settlements: [], totals: { earnedTomans: 0, paidTomans: 0, owedTomans: 0 } });
  render(<MemoryRouter><AdminTransactions /></MemoryRouter>);

  expect(await screen.findByText('هنوز سهمی برای مربی‌ها ثبت نشده است.')).toBeInTheDocument();
});
