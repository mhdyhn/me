import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
import { AdminCardTransferReceipts } from './AdminCardTransferReceipts';
import { openSection } from '../../test/openSection';

const requests = [
  {
    id: 3, authority: 'CARD-1', studentId: 8, studentName: 'سارا', coachName: 'مربی',
    amountTomans: 99999, transferAmountTomans: 99999, reference: 'MT-ABC123',
    trackingNumber: '123456789012', senderLast4: '1234', status: 'pending',
    confirmedBy: 'needs_review', createdAt: '2026-10-30T08:00:00.000Z', verifiedAt: null,
  },
  {
    id: 2, authority: 'CARD-2', studentId: 9, studentName: 'رضا', coachName: 'مربی',
    amountTomans: 99999, transferAmountTomans: 99999, reference: 'MT-XYZ789',
    trackingNumber: '999888777666', senderLast4: null, status: 'paid',
    confirmedBy: 'auto', createdAt: '2026-10-29T08:00:00.000Z', verifiedAt: '2026-10-29T08:10:00.000Z',
  },
];

beforeEach(() => { mocks.api.mockReset(); });
afterEach(cleanup);

describe('the card-transfer receipts of the manager', () => {
  it('lists the requests and settles a waiting receipt with one tap', async () => {
    mocks.api.mockResolvedValueOnce({ requests })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ requests: [requests[1]] });
    render(<AdminCardTransferReceipts />);
    openSection(/رسیدهای کارت‌به‌کارت/);
    expect(await screen.findByText('سارا')).toBeInTheDocument();
    expect(screen.getByText('123456789012')).toBeInTheDocument();
    expect(screen.getByText('تأییدشده')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تأیید رسید/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/admin/card-transfer/review', { authority: 'CARD-1', action: 'confirm' }));
  });

  it('says when there is nothing to review', async () => {
    mocks.api.mockResolvedValueOnce({ requests: [] });
    render(<AdminCardTransferReceipts />);
    openSection(/رسیدهای کارت‌به‌کارت/);
    expect(await screen.findByText(/هنوز پرداخت کارت‌به‌کارتی ثبت نشده است/)).toBeInTheDocument();
  });
});
