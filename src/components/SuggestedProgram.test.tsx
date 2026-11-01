import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ saveProgram: vi.fn() }));
vi.mock('../lib/programPersistence', () => ({ saveProgram: mocks.saveProgram }));

import { SuggestedProgram } from './SuggestedProgram';

describe('the suggested programme panel', () => {
  beforeEach(() => {
    mocks.saveProgram.mockReset();
    mocks.saveProgram.mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('changes the recommendation with the answers', async () => {
    render(<SuggestedProgram />);
    expect(screen.getByText('برنامهٔ ۳ روزه فول بادی (Full Body)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '۴ روز' }));
    expect(screen.getByText('برنامهٔ ۴ روزه بالاتنه / پایین‌تنه (Upper / Lower)')).toBeInTheDocument();
    expect(screen.getByText('۴ روز در هفته')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'خانه با دمبل یا وزن بدن' }));
    expect(screen.getByText(/با «گابلت اسکوات با دمبل» جایگزین شد/)).toBeInTheDocument();
  });

  it('activates the suggested programme', async () => {
    render(<SuggestedProgram />);
    fireEvent.click(screen.getByRole('button', { name: 'این برنامه را فعال کن' }));
    expect(await screen.findByRole('status')).toHaveTextContent('برنامهٔ پیشنهادی فعال شد.');
    expect(mocks.saveProgram).toHaveBeenCalledTimes(1);
    const saved = mocks.saveProgram.mock.calls[0]![0] as { exercises: unknown[] }[];
    expect(saved).toHaveLength(3);
  });

  it('shows the error when the programme cannot be saved', async () => {
    mocks.saveProgram.mockRejectedValueOnce(new Error('جلسهٔ فعالی دارید.'));
    render(<SuggestedProgram />);
    fireEvent.click(screen.getByRole('button', { name: 'این برنامه را فعال کن' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('جلسهٔ فعالی دارید.');
  });
});
