import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExerciseViewer } from '../src/components/ExerciseViewer';
import { GymProvider } from '../src/context/GymProvider';
import { workoutTemplates } from '../src/data/workouts';
import { db } from '../src/lib/db';
import { Workout } from '../src/pages/Workout';
import type { WorkoutSession } from '../src/types';

function renderWorkout(path = '/workout/push-a') {
  return render(
    <GymProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/workout/:templateId" element={<Workout />} /></Routes>
      </MemoryRouter>
    </GymProvider>,
  );
}

beforeEach(async () => {
  await db.sessions.clear();
  await db.bodyweights.clear();
  await db.nutritionDays.clear();
  await db.preferences.clear();
});

afterEach(() => cleanup());

describe('workout flow', () => {
  it('logs weight, reps and RIR, then starts a controllable rest timer', async () => {
    const user = userEvent.setup();
    renderWorkout();

    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '20');
    await user.clear(screen.getByRole('spinbutton', { name: 'تعداد تکرار' }));
    await user.type(screen.getByRole('spinbutton', { name: 'تعداد تکرار' }), '7');
    await user.selectOptions(screen.getByRole('combobox', { name: 'تکرار در ذخیره (RIR)' }), '3');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i }));

    expect(await screen.findByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم × ۷ · ۳ تکرار در ذخیره/)).toBeInTheDocument();
    expect(document.querySelector('.timer-readout')).toHaveTextContent('۰۲:۳۰');

    await user.click(screen.getByRole('button', { name: /مکث/ }));
    await user.click(screen.getByRole('button', { name: /افزودن ۱۵ ثانیه/ }));
    expect(document.querySelector('.timer-readout')).toHaveTextContent('۰۲:۴۵');
    await user.click(screen.getByRole('button', { name: /ادامه/ }));
    await user.click(screen.getByRole('button', { name: /پایان استراحت/ }));
    expect(screen.getByRole('button', { name: 'ست بعدی' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ست بعدی' }));
    expect(document.querySelector('.set-counter strong')).toHaveTextContent('۰۲');
  });

  it('restores the active session and logged set after remounting the app', async () => {
    const user = userEvent.setup();
    const firstMount = renderWorkout();
    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '20');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i }));
    await screen.findByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم × ۶ · ۲ تکرار در ذخیره/);
    firstMount.unmount();

    renderWorkout();
    expect(await screen.findByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم × ۶ · ۲ تکرار در ذخیره/)).toBeInTheDocument();
    await expect(db.sessions.count()).resolves.toBe(1);
  });

  it('completes a session and shows totals, volume, and a place for notes', async () => {
    const user = userEvent.setup();
    const optional = workoutTemplates.find((workout) => workout.id === 'optional-accessories');
    if (!optional) throw new Error('Optional workout fixture is missing.');
    const finalExerciseIndex = optional.exercises.length - 1;
    const finalPrescription = optional.exercises[finalExerciseIndex]?.prescription;
    if (!finalPrescription) throw new Error('Final exercise fixture is missing.');
    const session: WorkoutSession = {
      id: 'finish-flow', templateId: optional.id, name: optional.name,
      startedAt: new Date(Date.now() - 120_000).toISOString(), status: 'active', notes: '',
      currentExerciseIndex: finalExerciseIndex, currentSetIndex: finalPrescription.sets - 1,
      exercises: optional.exercises.map(({ exerciseId }) => ({ exerciseId, sets: [] })),
    };
    await db.sessions.put(session);

    renderWorkout('/workout/optional-accessories');
    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '10');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i }));
    await screen.findByText(/ست ۳ ثبت شد · ۱۰ کیلوگرم × ۱۰/);
    await user.click(screen.getByRole('button', { name: /پایان استراحت/ }));
    await user.click(screen.getByRole('button', { name: 'پایان تمرین' }));

    expect(await screen.findByText(/تمرین کامل شد/)).toBeInTheDocument();
    expect(screen.getByText('خلاصهٔ جلسه')).toBeInTheDocument();
    expect(screen.getByText('۱۰۰')).toBeInTheDocument();
    expect(screen.getByLabelText('نکته‌ای هست که بخواهی یادت بماند؟')).toBeInTheDocument();
  });
});

describe('3D reference model', () => {
  it('plays the movement loop for the exercise and keeps the model honest without one', async () => {
    const { unmount } = render(
      <ExerciseViewer modelAsset="/models/human.glb" motionId="barbell-bench-press" exerciseName="پرس سینه با هالتر" />,
    );
    expect(await screen.findByTestId('exercise-model-canvas')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('پویانمایی حرکت فعال است');
    expect(screen.getByRole('button', { name: 'توقف پویانمایی' })).toBeEnabled();
    expect(screen.getByText('استانداردهای فرم همین حرکت')).toBeInTheDocument();
    unmount();

    render(<ExerciseViewer modelAsset="/models/human.glb" exerciseName="حرکت بدون پویانمایی" />);
    expect(screen.getByRole('status')).toHaveTextContent('مدل ثابت · بدون پویانمایی');
    expect(screen.getByRole('button', { name: 'پخش پویانمایی' })).toBeDisabled();
    expect(screen.getByText(/برای این حرکت هنوز پویانمایی ثبت نشده است/)).toBeInTheDocument();
  });
});
