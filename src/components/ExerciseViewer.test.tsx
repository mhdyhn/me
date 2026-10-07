import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExerciseViewer } from './ExerciseViewer';
import { motions } from '../motion/library';

const benchPress = motions['barbell-bench-press']!;

describe('ExerciseViewer', () => {
  it('plays the movement loop of the exercise and shows its own form standards', async () => {
    render(<ExerciseViewer modelAsset="/models/human.glb" motionId="barbell-bench-press" exerciseName="پرس سینه" />);

    expect(screen.getByRole('status')).toHaveTextContent('پویانمایی حرکت فعال است');
    expect(screen.getByRole('heading', { name: 'نمای سه‌بعدی حرکت' })).toBeInTheDocument();
    expect(await screen.findByTestId('exercise-model-canvas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'توقف پویانمایی' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'شروع دوبارهٔ پویانمایی' })).toBeEnabled();
    expect(within(screen.getByRole('group', { name: 'سرعت پویانمایی' })).getAllByRole('button').every((button) => !button.hasAttribute('disabled'))).toBe(true);
    expect(screen.getByText(benchPress.summary)).toBeInTheDocument();
    expect(screen.getByText(benchPress.standards[0]!.label)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(benchPress.standards.length);
  });

  it('falls back to the still model when an exercise has no loop yet', async () => {
    render(<ExerciseViewer modelAsset="/models/human.glb" motionId="not-a-motion" exerciseName="پرس سینه" />);

    expect(screen.getByRole('status')).toHaveTextContent('مدل ثابت · بدون پویانمایی');
    expect(screen.getByRole('heading', { name: 'مدل سه‌بعدی بدن' })).toBeInTheDocument();
    expect(await screen.findByTestId('exercise-model-canvas')).toBeInTheDocument();
    for (const button of within(screen.getByRole('group', { name: 'سرعت پویانمایی' })).getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'پخش پویانمایی' })).toBeDisabled();
    expect(screen.getByText(/برای این حرکت هنوز پویانمایی ثبت نشده است/)).toBeInTheDocument();
  });

  it('switches to the muscle view and names the muscles it paints', async () => {
    render(
      <ExerciseViewer
        modelAsset="/models/human.glb"
        motionId="barbell-bench-press"
        exerciseName="پرس سینه"
        primaryMuscles={['سینه']}
        secondaryMuscles={['پشت بازو', 'سرشانهٔ جلویی']}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'نمای عضلات' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('نمای عضلات فعال است');
    expect(screen.getByText(/عضلهٔ اصلی: سینه/)).toBeInTheDocument();
    expect(screen.getByText(/عضلهٔ کمکی: پشت بازو/)).toBeInTheDocument();
    // The map says what it is: a training map, not a measurement.
    expect(screen.getByText(/نه اندازه‌گیری فعالیت عضلانی/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText(/عضلهٔ اصلی: سینه/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('پویانمایی حرکت فعال است');
  });

  it('says when a muscle of the catalogue cannot be painted on this model', async () => {
    render(
      <ExerciseViewer
        modelAsset="/models/human.glb"
        motionId="barbell-bench-press"
        exerciseName="پرس سینه"
        primaryMuscles={['سینه']}
        secondaryMuscles={['عضلهٔ ناشناخته در این مدل']}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'نمای عضلات' }));
    expect(screen.getByText(/در این مدل رنگ‌آمیزی نشده است/)).toBeInTheDocument();
  });

  it('keeps the explicit empty-state when no model asset exists', () => {
    render(<ExerciseViewer motionId="barbell-bench-press" exerciseName="پرس سینه" />);

    expect(screen.getByRole('status')).toHaveTextContent('مدل هنوز افزوده نشده');
    expect(screen.getByText('هنوز مدل سه‌بعدی اضافه نشده است')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'روبرو' })).toBeDisabled();
  });
});
