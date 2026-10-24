import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));

import { StudentNutritionPlan } from './StudentNutrition';

describe('student coach nutrition plan loading', () => {
  beforeEach(() => mocks.api.mockReset());
  afterEach(() => cleanup());

  it('retries a failed request and distinguishes no plan from a load failure', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ coachName: null, plan: null });
    render(<StudentNutritionPlan />);

    expect(await screen.findByText('برنامهٔ غذایی بارگذاری نشد.')).toBeInTheDocument();
    expect(screen.queryByText('مربی هنوز برنامهٔ غذایی شما را تعریف نکرده است.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری برنامه' }));

    expect(await screen.findByText('مربی هنوز برنامهٔ غذایی شما را تعریف نکرده است.')).toBeInTheDocument();
    expect(screen.queryByText('برنامهٔ غذایی بارگذاری نشد.')).not.toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
