import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));

import { MealDiary } from './MealDiary';

const targets = { kcal: null, proteinG: null, carbsG: null, fatG: null };

describe('daily meal diary loading recovery', () => {
  beforeEach(() => mocks.api.mockReset());
  afterEach(() => cleanup());

  it('retries the selected day and shows an empty diary only after a successful response', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ diary: { day: '2026-10-24', meals: [] } });
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
