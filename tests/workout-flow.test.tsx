import Dexie from 'dexie';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GymProvider } from '../src/context/GymProvider';
import { workoutTemplates } from '../src/data/workouts';
import { db } from '../src/lib/db';
import { setActiveProgram } from '../src/lib/programStore';
import { Workout } from '../src/pages/Workout';
import type { WorkoutSession } from '../src/types';

function renderWorkout(path = '/workout/day-1') {
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
  // A new account is empty; this flow explicitly chooses a workout fixture.
  await db.preferences.put({ key: 'programTemplates', value: structuredClone(workoutTemplates) });
  setActiveProgram(structuredClone(workoutTemplates));
});

afterEach(() => { cleanup(); setActiveProgram([]); });

describe('workout flow', () => {
  it('shows a storage warning rather than creating a session or waiting forever after a read failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.sessions, 'toArray').mockImplementationOnce((() => Dexie.Promise.reject(new Error('read failed'))) as typeof db.sessions.toArray);
    renderWorkout();
    expect(await screen.findByText('وضعیت تمرین در دستگاه نامشخص است')).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: 'وزنه به کیلوگرم' })).not.toBeInTheDocument();
    expect(await db.sessions.count()).toBe(0);
    vi.restoreAllMocks();
  });
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
    await waitFor(() => expect(screen.getByRole('button', { name: /افزودن ۱۵ ثانیه/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /افزودن ۱۵ ثانیه/ }));
    await waitFor(() => expect(document.querySelector('.timer-readout')).toHaveTextContent('۰۲:۴۵'));
    await waitFor(() => expect(screen.getByRole('button', { name: /ادامه/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /ادامه/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /پایان استراحت/ })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /پایان استراحت/ }));
    expect(await screen.findByRole('button', { name: 'ست بعدی' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ست بعدی' }));
    await waitFor(() => expect(document.querySelector('.set-counter strong')).toHaveTextContent('۰۲'));
  }, 15000);

  it('trains a programmed movement using the programme name', async () => {
    renderWorkout('/workout/day-2');
    expect(await screen.findByRole('heading', { name: 'زیربغل سیمکش مچ برعکس' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i })).toBeInTheDocument();
  });

  it('restores the active session and logged set after remounting the app', async () => {
    const user = userEvent.setup();
    const firstMount = renderWorkout();
    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '20');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i }));
    await screen.findByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم × ۵ · ۲ تکرار در ذخیره/);
    firstMount.unmount();

    renderWorkout();
    expect(await screen.findByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم × ۵ · ۲ تکرار در ذخیره/)).toBeInTheDocument();
    await expect(db.sessions.count()).resolves.toBe(1);
  });

  it('completes a session and shows totals, volume, and a place for notes', async () => {
    const user = userEvent.setup();
    const optional = workoutTemplates.find((workout) => workout.id === 'day-1');
    if (!optional) throw new Error('Day 1 workout fixture is missing.');
    const finalExerciseIndex = optional.exercises.length - 1;
    const finalPrescription = optional.exercises[finalExerciseIndex]?.prescription;
    if (!finalPrescription) throw new Error('Final exercise fixture is missing.');
    const session: WorkoutSession = {
      id: 'finish-flow', templateId: optional.id, templateSnapshot: structuredClone(optional), name: optional.name,
      startedAt: new Date(Date.now() - 120_000).toISOString(), status: 'active', notes: '',
      currentExerciseIndex: finalExerciseIndex, currentSetIndex: finalPrescription.sets - 1,
      exercises: optional.exercises.map(({ exerciseId }) => ({ exerciseId, sets: [] })),
    };
    await db.sessions.put(session);

    renderWorkout('/workout/day-1');
    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '10');
    await user.clear(screen.getByRole('spinbutton', { name: 'تعداد تکرار' }));
    await user.type(screen.getByRole('spinbutton', { name: 'تعداد تکرار' }), '10');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/i }));
    await screen.findByText(/ست ۳ ثبت شد · ۱۰ کیلوگرم × ۱۰/);
    await user.click(screen.getByRole('button', { name: /پایان استراحت/ }));
    await user.click(await screen.findByRole('button', { name: 'پایان تمرین' }));

    expect(await screen.findByText(/تمرین کامل شد/)).toBeInTheDocument();
    expect(screen.getByText('خلاصهٔ جلسه')).toBeInTheDocument();
    expect(screen.getByText('۱۰۰')).toBeInTheDocument();
    expect(screen.getByLabelText('نکته‌ای هست که بخواهی یادت بماند؟')).toBeInTheDocument();
    const savedSessions = await db.sessions.toArray();
    expect(savedSessions).toHaveLength(1);
    expect(savedSessions[0]?.status).toBe('completed');
  });

  it('resolves conflict by completing previous active session and starting new workout day', async () => {
    const user = userEvent.setup();
    const activeSession: WorkoutSession = {
      id: 'active-day-1',
      templateId: 'day-1',
      name: 'روز ۱: سینه و جلو بازو',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      notes: '',
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      exercises: [{ exerciseId: 'bench-press', sets: [] }],
    };
    await db.sessions.put(activeSession);

    renderWorkout('/workout/day-2');

    expect(await screen.findByText('جلسهٔ دیگری در حال انجام است')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /اتمام و ثبت جلسهٔ قبلی و شروع این روز/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /اتمام و ثبت جلسهٔ قبلی و شروع این روز/ }));

    expect(await screen.findByRole('heading', { name: 'زیربغل سیمکش مچ برعکس' })).toBeInTheDocument();
    const stored = await db.sessions.toArray();
    expect(stored.find((item) => item.id === 'active-day-1')?.status).toBe('completed');
    expect(stored.find((item) => item.templateId === 'day-2')?.status).toBe('active');
  });

  it('resolves conflict by discarding previous active session and starting new workout day', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const activeSession: WorkoutSession = {
      id: 'active-to-cancel',
      templateId: 'day-1',
      name: 'روز ۱: سینه و جلو بازو',
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      status: 'active',
      notes: '',
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      exercises: [{ exerciseId: 'bench-press', sets: [] }],
    };
    await db.sessions.put(activeSession);

    renderWorkout('/workout/day-2');

    expect(await screen.findByText('جلسهٔ دیگری در حال انجام است')).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: /حذف جلسهٔ قبلی و شروع این روز/ });
    await user.click(cancelBtn);

    expect(await screen.findByRole('heading', { name: 'زیربغل سیمکش مچ برعکس' })).toBeInTheDocument();
    expect(await db.sessions.get('active-to-cancel')).toBeUndefined();
    expect((await db.sessions.toArray()).find((item) => item.templateId === 'day-2')?.status).toBe('active');
  });
});
