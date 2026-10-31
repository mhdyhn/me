import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CardTransferCheckout } from './CardTransferCheckout';
import type { AssignedMeta } from '../lib/programStore';

const program: AssignedMeta = {
  id: 'offer-a', version: 3, title: 'برنامهٔ آزمایش', priceTomans: 250000,
  coachName: 'مربی', isPaid: false, cardTransferAvailable: true,
};

const details = {
  authority: 'CARD-1234', programmeId: 'offer-a', programmeTitle: 'برنامهٔ آزمایش', coachName: 'مربی',
  priceTomans: 250000, transferAmountTomans: 250512, reference: 'MT-AB12CD',
  cardNumber: '6037999912345678', cardHolder: 'شرکت میتی', expiresAt: '2026-11-02T08:00:00.000Z',
  instructions: ['مبلغ ۲۵۰۵۱۲ تومان را دقیقاً به کارت زیر واریز کنید.'],
};

const sent: { path: string; body?: unknown }[] = [];

function stubApi(handlers: Record<string, unknown>) {
  sent.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace(/^.*\/api/, '');
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const handler = handlers[path];
    const payload = handler === undefined ? { error: 'unexpected request' } : handler;
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

describe('card-to-card checkout', () => {
  it('shows the card, the exact amount and the reference after the request starts', async () => {
    const user = userEvent.setup();
    stubApi({ '/pay/card-transfer/start': details });
    render(<CardTransferCheckout program={program} />);

    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    expect(await screen.findByText('6037 9999 1234 5678')).toBeTruthy();
    expect(screen.getByText((content) => content.replace(/[٬,]/g, '') === '۲۵۰۵۱۲')).toBeTruthy();
    expect(screen.getByText('MT-AB12CD')).toBeTruthy();
    expect(sent[0]?.path).toBe('/pay/card-transfer/start');
    expect(sent[0]?.body).toMatchObject({ expectedId: 'offer-a', expectedVersion: 3 });
  });

  it('sends the receipt and reports the automatic confirmation', async () => {
    const user = userEvent.setup();
    stubApi({
      '/pay/card-transfer/start': details,
      '/pay/card-transfer/receipt': { success: true, message: 'رسید واریزی تأیید شد و برنامهٔ شما باز شد.' },
      '/me/program': { program: null, isPaid: true },
    });
    render(<CardTransferCheckout program={program} />);
    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    await screen.findByText('6037 9999 1234 5678');

    await user.type(screen.getByLabelText('شمارهٔ پیگیری رسید'), '99887766');
    await user.type(screen.getByLabelText(/چهار رقم آخر کارت مبدأ/), '4321');
    await user.click(screen.getByRole('button', { name: /ثبت رسید و فعال‌سازی برنامه/ }));

    expect(await screen.findByText(/رسید واریزی تأیید شد/)).toBeTruthy();
    const receipt = sent.find((call) => call.path === '/pay/card-transfer/receipt');
    expect(receipt?.body).toMatchObject({ authority: 'CARD-1234', trackingNumber: '99887766', senderCardLast4: '4321' });
  });

  it('keeps the programme locked when the server refuses the receipt', async () => {
    const user = userEvent.setup();
    stubApi({
      '/pay/card-transfer/start': details,
      '/pay/card-transfer/receipt': { error: 'رسید واریزی در سرویس بررسی بانکی تأیید نشد.' },
    });
    render(<CardTransferCheckout program={program} />);
    await user.click(screen.getByRole('button', { name: /پرداخت کارت‌به‌کارت/ }));
    await screen.findByText('6037 9999 1234 5678');
    await user.type(screen.getByLabelText('شمارهٔ پیگیری رسید'), '99887766');
    await user.click(screen.getByRole('button', { name: /ثبت رسید و فعال‌سازی برنامه/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('تأیید نشد'));
    expect(screen.queryByText(/برنامهٔ شما باز شد/)).toBeNull();
  });
});
