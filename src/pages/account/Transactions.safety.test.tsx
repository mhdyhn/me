import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error { status = 0; } }));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ user: { id: 7, role: 'coach' } }) }));
vi.mock('../../components/PaymentPractice', () => ({ PaymentPractice: () => null }));
import { CoachTransactions } from './Transactions';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);

it('loads before editing, accepts Persian digits and locks the field during save', async () => {
  const load = deferred<unknown>(); const save = deferred<unknown>();
  mocks.api.mockImplementation((method: string, path: string) => path.startsWith('/coach/iban') ? method === 'GET' ? load.promise : save.promise : Promise.resolve({ transactions: [], testTransactions: [] }));
  render(<MemoryRouter><CoachTransactions /></MemoryRouter>);
  const field = screen.getByLabelText('شماره شبای بانکی');
  expect(field).toBeDisabled();
  await act(async () => load.resolve({ iban: null }));
  expect(field).toBeEnabled();
  fireEvent.change(field, { target: { value: 'ir۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵۶۷۸۹۰۱۲۳۴' } });
  expect(field).toHaveValue('IR123456789012345678901234');
  fireEvent.click(screen.getByRole('button', { name: /ذخیره شبا/ }));
  expect(field).toBeDisabled();
  expect(mocks.api).toHaveBeenCalledWith('PUT', '/coach/iban', { accountId: 7, iban: 'IR123456789012345678901234' });
  await act(async () => save.resolve({ ok: true, iban: 'IR123456789012345678901234' }));
  expect(await screen.findByText('شماره شبا با موفقیت ذخیره شد.')).toBeInTheDocument();
});

it('does not permit editing after a failed load and rejects a malformed successful save', async () => {
  mocks.api.mockImplementation((method: string, path: string) => path.startsWith('/coach/iban') ? method === 'GET' ? Promise.reject(new Error('offline')) : Promise.resolve({}) : Promise.resolve({ transactions: [], testTransactions: [] }));
  render(<MemoryRouter><CoachTransactions /></MemoryRouter>);
  expect(await screen.findByText(/شمارهٔ شبا بارگذاری نشد/)).toBeInTheDocument();
  expect(screen.getByLabelText('شماره شبای بانکی')).toBeDisabled();
  mocks.api.mockImplementation((method: string, path: string) => path.startsWith('/coach/iban') ? method === 'GET' ? Promise.resolve({ iban: null }) : Promise.resolve({}) : Promise.resolve({ transactions: [], testTransactions: [] }));
  fireEvent.click(screen.getByRole('button', { name: 'بررسی شمارهٔ ذخیره‌شده' }));
  await waitFor(() => expect(screen.getByLabelText('شماره شبای بانکی')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('شماره شبای بانکی'), { target: { value: 'IR123456789012345678901234' } });
  fireEvent.click(screen.getByRole('button', { name: /ذخیره شبا/ }));
  expect(await screen.findByText(/نتیجهٔ ذخیره تأیید نشد/)).toBeInTheDocument();
  expect(screen.getByLabelText('شماره شبای بانکی')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'بررسی شمارهٔ ذخیره‌شده' })).toBeEnabled();
  expect(screen.queryByText('شماره شبا با موفقیت ذخیره شد.')).not.toBeInTheDocument();
});
