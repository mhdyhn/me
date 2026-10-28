import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentPractice } from './PaymentPractice';

const program = { id: 'offer-1', version: 3, priceTomans: 99999 };
const quote = { simulation: true, programmeTitle: 'برنامهٔ تمرینی', amountTomans: 99999, coachShareTomans: 89999, adminShareTomans: 10000 };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('payment practice', () => {
  it('lets a coach rehearse success and cancellation without any checkout or ledger call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(quote));
    // Each request needs a fresh Response because its body can be read only once.
    fetchMock.mockImplementation(async () => response(quote));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PaymentPractice program={program} studentId={7} />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    expect(screen.getByText(/تراکنشی ثبت نمی‌کند و برنامه را باز نمی‌کند/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    expect(await screen.findByText('پیش‌نمایش آزمایشی: برنامهٔ تمرینی')).toBeInTheDocument();
    expect(screen.getByText(/سهم محاسبه‌شدهٔ مربی: ۸۹٬۹۹۹ تومان/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/pay/practice');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ expectedId: 'offer-1', expectedVersion: 3, studentId: 7 });
    await user.click(screen.getByRole('button', { name: 'فرض پرداخت موفق' }));
    expect(screen.getByRole('status')).toHaveTextContent('پرداخت موفق فرض شد');
    expect(screen.getByRole('status')).toHaveTextContent('هیچ پول، تراکنش یا دسترسی واقعی ایجاد نشده است');
    expect(fetchMock).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'آزمایش دوباره' }));
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    await screen.findByRole('button', { name: 'فرض انصراف' });
    await user.click(screen.getByRole('button', { name: 'فرض انصراف' }));
    expect(screen.getByRole('status')).toHaveTextContent('انصراف فرض شد');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([path]) => path === '/api/pay/practice')).toBe(true);
  });

  it('does not display coach shares or send a student id when used by a student', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response(quote));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PaymentPractice program={program} />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    await screen.findByText('پیش‌نمایش آزمایشی: برنامهٔ تمرینی');
    expect(screen.queryByText(/سهم محاسبه‌شدهٔ مربی/)).not.toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ expectedId: 'offer-1', expectedVersion: 3 });
  });

  it('lets a coach try an arbitrary sample without any student or real programme', async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => response({ simulation: true, programmeTitle: 'برنامهٔ نمونه', amountTomans: 123456, coachShareTomans: 111110, adminShareTomans: 12346 }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PaymentPractice program={null} sample />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    expect(screen.getByText(/مستقل از حساب شاگرد و برنامه‌های واقعی/)).toBeInTheDocument();
    const amount = screen.getByLabelText('مبلغ نمونه (تومان)');
    await user.clear(amount);
    expect(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' })).toBeDisabled();
    await user.type(amount, '123456');
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    expect(await screen.findByText('پیش‌نمایش آزمایشی: برنامهٔ نمونه')).toBeInTheDocument();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({ sampleAmountTomans: 123456 });
    await user.click(screen.getByRole('button', { name: 'فرض پرداخت موفق' }));
    expect(screen.getByRole('status')).toHaveTextContent('هیچ پول، تراکنش یا دسترسی واقعی ایجاد نشده است');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires a saved paid programme before starting', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const view = render(<PaymentPractice program={null} studentId={7} />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    expect(screen.getByText('ابتدا یک برنامهٔ پولی برای شاگرد ذخیره کنید.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'شروع آزمایش پرداخت' })).not.toBeInTheDocument();
    view.rerender(<PaymentPractice program={{ ...program, priceTomans: 0 }} studentId={7} />);
    expect(screen.queryByRole('button', { name: 'شروع آزمایش پرداخت' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a stale-version error and refuses an unlabelled response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ error: 'برنامه تغییر کرده است؛ صفحه را دوباره بارگذاری کنید.' }, 409))
      .mockResolvedValueOnce(response({ ...quote, simulation: false }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<PaymentPractice program={program} studentId={7} />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('برنامه تغییر کرده است');
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('آزمایش بارگذاری نشد');
    expect(screen.queryByRole('button', { name: 'فرض پرداخت موفق' })).not.toBeInTheDocument();
  });

  it('ignores a delayed quote when the saved programme changes', async () => {
    let complete!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const view = render(<PaymentPractice program={program} studentId={7} />);
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    view.rerender(<PaymentPractice program={{ ...program, version: 4 }} studentId={7} />);
    await act(async () => { complete(response(quote)); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' })).toBeEnabled());
    expect(screen.queryByText('پیش‌نمایش آزمایشی: برنامهٔ تمرینی')).not.toBeInTheDocument();
  });
});
