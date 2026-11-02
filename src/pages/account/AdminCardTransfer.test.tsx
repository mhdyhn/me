import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
import { AdminCardTransfer } from './AdminCardTransfer';
import { openSection } from '../../test/openSection';

const settings = {
  cardNumber: '6037999912345678',
  cardHolder: 'شرکت میتی',
  bankName: 'ملت',
  expiryHours: 72,
  maxPerDay: 3,
  uniqueAmount: true,
  updatedAt: null,
};

beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);

describe('the card-transfer settings of the admin panel', () => {
  it('shows the saved card and switches the payment on', async () => {
    mocks.api.mockResolvedValueOnce({ enabled: false, source: 'environment', settings: { ...settings, cardNumber: '', cardHolder: '' } })
      .mockResolvedValueOnce({ enabled: true })
      .mockResolvedValueOnce({ enabled: true, source: 'panel', settings });
    render(<AdminCardTransfer />);
    openSection(/پرداخت کارت‌به‌کارت/);
    expect(await screen.findByText('غیرفعال')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('شمارهٔ کارت مقصد'), { target: { value: '6037999912345678' } });
    fireEvent.change(screen.getByLabelText('نام صاحب کارت'), { target: { value: 'شرکت میتی' } });
    fireEvent.change(screen.getByLabelText('نام بانک (اختیاری)'), { target: { value: 'ملت' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ تنظیمات/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('PUT', '/admin/card-transfer', {
      cardNumber: '6037999912345678',
      cardHolder: 'شرکت میتی',
      bankName: 'ملت',
      expiryHours: 72,
      maxPerDay: 3,
      uniqueAmount: true,
    }));
    expect(await screen.findByText(/فعال شد و از همین حالا/)).toBeInTheDocument();
  });

  it('shows the card the students pay to when the payment is already on', async () => {
    mocks.api.mockResolvedValueOnce({ enabled: true, source: 'panel', settings });
    render(<AdminCardTransfer />);
    openSection(/پرداخت کارت‌به‌کارت/);
    expect(await screen.findByText('فعال')).toBeInTheDocument();
    expect((screen.getByLabelText('شمارهٔ کارت مقصد') as HTMLInputElement).value).toBe('6037999912345678');
  });
});
