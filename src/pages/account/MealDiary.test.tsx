import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));

import { MealDiary } from './MealDiary';
import { getLocalDateKey } from '../../lib/format';

const targets = { kcal: null, proteinG: null, carbsG: null, fatG: null };

describe('daily meal diary loading recovery', () => {
  beforeEach(() => { mocks.api.mockReset(); });
  afterEach(() => cleanup());

  it('retries the selected day and shows an empty diary only after a successful response', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ diary: { day: getLocalDateKey(), meals: [], updatedAt: null } });
    render(<MealDiary targets={targets} />);

    expect(await screen.findByText('دفترچهٔ غذایی بارگذاری نشد.')).toBeInTheDocument();
    expect(screen.queryByText(/هنوز وعده‌ای نیست/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری این روز' }));

    expect(await screen.findByText(/هنوز وعده‌ای نیست/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /افزودن وعده/ })).toBeInTheDocument();
    expect(screen.queryByText('دفترچهٔ غذایی بارگذاری نشد.')).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});

describe('daily meal diary saving safety', () => {
  beforeEach(() => { mocks.api.mockReset(); });
  afterEach(() => cleanup());

  it('does not allow edits or switching day while the save response is pending', async () => {
    let finishSave!: (value: unknown) => void;
    const pending = new Promise((resolve) => { finishSave = resolve; });
    mocks.api.mockImplementation((method: string) => method === 'GET'
      ? Promise.resolve({ diary: { day: getLocalDateKey(), meals: [], updatedAt: null } })
      : pending);
    render(<MealDiary targets={targets} />);
    const name = await screen.findByLabelText('نام وعده');
    fireEvent.change(name, { target: { value: 'صبحانه' } });
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وعده' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ این روز' }));
    expect(screen.getByLabelText('روز')).toBeDisabled();
    screen.getAllByLabelText('نام وعده').forEach((input) => expect(input).toBeDisabled());
    finishSave({ diary: { day: getLocalDateKey(), meals: [{ name: 'صبحانه', items: [] }], updatedAt: 'now' } });
    expect(await screen.findByText('ثبت این روز ذخیره شد.')).toBeInTheDocument();
    expect(screen.getByLabelText('روز')).toBeEnabled();
  });
});
