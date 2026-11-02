import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), navigate: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => mocks.navigate };
});
import { QuickReceipt } from './QuickReceipt';

const request = {
  authority: 'CARD-1234',
  amountTomans: 99999,
  transferAmountTomans: 99999,
  reference: 'MT-ABC123',
  trackingNumber: null,
  status: 'pending',
  createdAt: '2026-10-30T08:00:00.000Z',
  expiresAt: '2026-11-02T08:00:00.000Z',
  cardNumber: '6037999912345678',
  cardHolder: 'شرکت میتی',
  bankName: 'ملت',
};

beforeEach(() => { mocks.api.mockReset(); mocks.navigate.mockReset(); });
afterEach(cleanup);

describe('the quick receipt screen', () => {
  it('shows the amount and the card and opens the programme after the receipt', async () => {
    mocks.api.mockResolvedValueOnce({ pending: true, request })
      .mockResolvedValueOnce({ success: true, message: 'رسید واریزی تأیید شد و برنامهٔ شما باز شد.' });
    render(<MemoryRouter><QuickReceipt /></MemoryRouter>);
    expect(await screen.findByText('MT-ABC123')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('شمارهٔ پیگیری رسید'), { target: { value: '123456789012' } });
    fireEvent.click(screen.getByRole('button', { name: /ثبت رسید و بازکردن برنامه/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/pay/card-transfer/receipt', {
      authority: 'CARD-1234', trackingNumber: '123456789012',
    }));
    expect(await screen.findByText(/برنامهٔ شما باز شد/)).toBeInTheDocument();
  });

  it('sends the student to the programme when there is no open payment', async () => {
    mocks.api.mockResolvedValueOnce({ pending: false, request: null });
    render(<MemoryRouter><QuickReceipt /></MemoryRouter>);
    expect(await screen.findByText(/اگر برنامه‌ای برای پرداخت ندارید/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'رفتن به برنامه' })).toBeInTheDocument();
  });
});
