import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), load: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../lib/assignedProgram', () => ({ loadAssignedProgram: mocks.load }));

import { PaymentResult } from './PaymentResult';

describe('payment outcome labels', () => {
  it('does not present a sandbox result as a bank payment', async () => {
    mocks.api.mockResolvedValue({ success: true, message: 'موفق', transaction: { amountTomans: 100, refId: 'SANDBOX-123', coachName: 'مربی' } });
    render(<MemoryRouter initialEntries={['/payment/result?Authority=SANDBOX-abc&Status=OK']}><PaymentResult /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'پرداخت آزمایشی با موفقیت شبیه‌سازی شد' })).toBeInTheDocument();
    expect(screen.getByText('هیچ مبلغ واقعی منتقل نشده است.')).toBeInTheDocument();
    expect(screen.getByText('شناسهٔ آزمایشی:')).toBeInTheDocument();
    expect(screen.queryByText('کد پیگیری بانکی:')).not.toBeInTheDocument();
  });
});
