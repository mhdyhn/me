import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionCheckout } from './SubscriptionCheckout';

const details = {
  authority: 'SUB-1234', priceTomans: 99000, transferAmountTomans: 99123, reference: 'MT-AB12CD',
  cardNumber: '6037999912345678', cardHolder: 'شرکت میتی', expiresAt: '2026-11-30T08:00:00.000Z',
  instructions: ['مبلغ ۹۹۱۲۳ تومان را دقیقاً به کارت زیر واریز کنید.'],
};

const sent: { path: string; body?: unknown }[] = [];

function stubApi(handlers: Record<string, unknown>) {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api/, '');
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = handlers[path];
    const payload = handler === undefined ? { error: 'unexpected request' } : handler;
    const status = handler === undefined ? 404 : (payload as { error?: string }).error ? 409 : 200;
    return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
  }));
}

beforeEach(() => {
  vi.stubEnv('VITE_API_BASE', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('buying the student subscription', () => {
  it('shows the exact amount, the card and the reference after the request starts', async () => {
    const user = userEvent.setup();
    stubApi({ '/me/subscription/checkout': details });
    render(<SubscriptionCheckout priceTomans={99000} />);

    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    expect(await screen.findByText('6037 9999 1234 5678')).toBeTruthy();
    expect(screen.getByText((content) => content.replace(/[٬,]/g, '') === '۹۹۱۲۳')).toBeTruthy();
    expect(screen.getByText('MT-AB12CD')).toBeTruthy();
    expect(sent[0]?.path).toBe('/me/subscription/checkout');
  });

  it('sends the receipt and reports the automatic confirmation', async () => {
    const user = userEvent.setup();
    stubApi({
      '/me/subscription/checkout': details,
      '/me/subscription/receipt': {
        success: true,
        message: 'رسید واریزی تأیید شد و اشتراک هوشمند شما فعال شد.',
        state: { priceTomans: 99000, active: true, expiresAt: '2026-11-30T08:00:00.000Z', daysLeft: 30, referralCoachName: null, cardTransferAvailable: true },
      },
    });
    render(<SubscriptionCheckout priceTomans={99000} />);
    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    await screen.findByText('6037 9999 1234 5678');

    await user.type(screen.getByLabelText('شمارهٔ پیگیری رسید'), '99887766');
    await user.click(screen.getByRole('button', { name: /ثبت رسید و فعال‌سازی اشتراک/ }));

    expect(await screen.findByText(/رسید واریزی تأیید شد/)).toBeTruthy();
    const receipt = sent.find((call) => call.path === '/me/subscription/receipt');
    expect(receipt?.body).toMatchObject({ authority: 'SUB-1234', trackingNumber: '99887766' });
  });

  it('keeps the subscription closed when the server refuses the receipt', async () => {
    const user = userEvent.setup();
    stubApi({
      '/me/subscription/checkout': details,
      '/me/subscription/receipt': { error: 'رسید واریزی در سرویس بررسی بانکی تأیید نشد.' },
    });
    render(<SubscriptionCheckout priceTomans={99000} />);
    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    await screen.findByText('6037 9999 1234 5678');
    await user.type(screen.getByLabelText('شمارهٔ پیگیری رسید'), '99887766');
    await user.click(screen.getByRole('button', { name: /ثبت رسید و فعال‌سازی اشتراک/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('تأیید نشد'));
    expect(screen.queryByText(/اشتراک هوشمند شما فعال شد/)).toBeNull();
  });
});
