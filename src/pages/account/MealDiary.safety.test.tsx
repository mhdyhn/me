import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: mocks.ApiError }));
import { MealDiary } from './MealDiary';
import type { PlanMeal } from '../../lib/nutrition';
import { getLocalDateKey } from '../../lib/format';

const targets = { kcal: null, proteinG: null, carbsG: null, fatG: null };
const meal = (name: string) => ({ name, items: [] });

beforeEach(() => { mocks.api.mockReset(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('meal diary conflict and recovery', () => {
  it('preserves a draft and requires a decision after another device saves the same day', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let server: PlanMeal[] = [];
    const writes: unknown[] = [];
    mocks.api.mockImplementation(async (method: string, path: string, body?: { day: string; meals: PlanMeal[]; expectedMeals: PlanMeal[]; accountId: number }) => {
      if (method === 'GET') return { diary: { day: path.slice(10, 20), meals: server, updatedAt: 'now' } };
      writes.push(body);
      if (JSON.stringify(body!.expectedMeals) !== JSON.stringify(server)) throw new mocks.ApiError(409, 'تعارض');
      server = body!.meals;
      return { diary: { day: body!.day, meals: server, updatedAt: 'now' } };
    });
    render(<MealDiary targets={targets} accountId={3} />);
    fireEvent.change(await screen.findByLabelText('نام وعده'), { target: { value: 'وعدهٔ من' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    server = [meal('وعدهٔ دستگاه دیگر')];
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(await screen.findByText(/این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است/)).toBeInTheDocument();
    expect(screen.getByDisplayValue('وعدهٔ من')).toBeInTheDocument();
    expect(screen.getByText('وعدهٔ دستگاه دیگر')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ این روز' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(await screen.findByText('ثبت این روز ذخیره شد.')).toBeInTheDocument();
    expect(server).toEqual([meal('وعدهٔ من')]);
    expect(writes[1]).toMatchObject({ accountId: 3, expectedMeals: [meal('وعدهٔ دستگاه دیگر')] });
  });

  it('recognizes a save whose response was lost if the server already has exactly that data', async () => {
    let server: PlanMeal[] = [];
    mocks.api.mockImplementation(async (method: string, _path: string, body?: { day: string; meals: PlanMeal[] }) => {
      if (method === 'GET') return { diary: { day: getLocalDateKey(), meals: server, updatedAt: 'now' } };
      server = body!.meals;
      throw new mocks.ApiError(0, 'timeout');
    });
    render(<MealDiary targets={targets} accountId={3} />);
    fireEvent.change(await screen.findByLabelText('نام وعده'), { target: { value: 'صبحانه' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(await screen.findByText('ثبت این روز ذخیره شد.')).toBeInTheDocument();
    expect(screen.queryByText(/وضعیت ذخیره یا نسخهٔ تازه روشن نیست/)).not.toBeInTheDocument();
  });

  it('keeps drafts separate for account and day when navigating away or changing the date', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.api.mockImplementation(async (method: string, path: string) => {
      if (method !== 'GET') throw new Error('unexpected');
      return { diary: { day: path.split('/').at(-1)!.split('?')[0], meals: [], updatedAt: null } };
    });
    const first = render(<MealDiary targets={targets} accountId={3} />);
    const originalDay = (await screen.findByLabelText('روز') as HTMLInputElement).value;
    fireEvent.change(await screen.findByLabelText('نام وعده'), { target: { value: 'صبحانهٔ شخصی' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    await screen.findByText(/نسخهٔ موقت فقط در همین زبانه است/);
    const yesterday = new Date(`${originalDay}T12:00:00`); yesterday.setDate(yesterday.getDate() - 1);
    const previousDay = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByLabelText('روز'), { target: { value: previousDay } });
    await waitFor(() => expect(screen.getByLabelText('روز')).toHaveValue(previousDay));
    await screen.findByText(/هنوز وعده‌ای نیست/);
    expect(screen.queryByDisplayValue('صبحانهٔ شخصی')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('روز'), { target: { value: originalDay } });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByDisplayValue('صبحانهٔ شخصی')).toBeInTheDocument();
    first.unmount();
    const other = render(<MealDiary targets={targets} accountId={4} />);
    await screen.findByText(/هنوز وعده‌ای نیست/);
    expect(screen.queryByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).not.toBeInTheDocument();
    other.unmount();
    render(<MealDiary targets={targets} accountId={3} />);
    expect(await screen.findByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).toBeInTheDocument();
  });

  it('keeps the draft and blocks another save if fetching the latest version fails', async () => {
    let gets = 0;
    mocks.api.mockImplementation(async (method: string) => {
      if (method === 'PUT') throw new mocks.ApiError(409, 'تعارض');
      gets += 1;
      if (gets === 2) throw new mocks.ApiError(0, 'اینترنت قطع است.');
      return { diary: { day: getLocalDateKey(), meals: gets > 2 ? [meal('نسخهٔ تازه')] : [], updatedAt: 'now' } };
    });
    render(<MealDiary targets={targets} accountId={3} />);
    fireEvent.change(await screen.findByLabelText('نام وعده'), { target: { value: 'کار من' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(await screen.findByText('اینترنت قطع است.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('کار من')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ این روز' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'دریافت نسخهٔ تازه' }));
    expect(await screen.findByText('نسخهٔ تازه')).toBeInTheDocument();
    expect(screen.getByDisplayValue('کار من')).toBeInTheDocument();
  });

  it('keeps a diary draft and requires a fresh read after a malformed save response', async () => {
    let loads = 0;
    mocks.api.mockImplementation(async (method: string, path: string) => {
      if (method === 'PUT') return {};
      loads += 1;
      if (loads === 1) return { diary: { day: path.split('/').at(-1)!.split('?')[0], meals: [], updatedAt: null } };
      throw new mocks.ApiError(0, 'دریافت نسخهٔ تازه ناموفق است.');
    });
    render(<MealDiary targets={targets} accountId={3} />);
    fireEvent.change(await screen.findByLabelText('نام وعده'), { target: { value: 'خوراک من' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(await screen.findByText('دریافت نسخهٔ تازه ناموفق است.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('خوراک من')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ این روز' })).toBeDisabled();
  });

});
