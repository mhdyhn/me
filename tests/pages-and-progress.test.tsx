import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GymProvider } from '../src/context/GymProvider';
import { SessionProvider } from '../src/context/SessionContext';
import { Dashboard } from '../src/pages/Dashboard';
import { ExerciseDetail } from '../src/pages/ExerciseDetail';
import { ExerciseLibrary } from '../src/pages/ExerciseLibrary';
import { Nutrition } from '../src/pages/Nutrition';
import { Program } from '../src/pages/Program';
import { Progress } from '../src/pages/Progress';
import { Settings } from '../src/pages/Settings';
import { db } from '../src/lib/db';
import { getLocalDateKey } from '../src/lib/format';
import { getWeekComparison, getWeeklyTotals } from '../src/lib/analytics';
import { exerciseNames } from '../src/data/exerciseNames';
import { adminPersonalProgram } from '../src/data/adminProgram';
import { adminExerciseCatalogId } from '../src/data/adminExerciseGuides';
import { exercises } from '../src/data/exercises';
import type { WorkoutSession } from '../src/types';

const completedSession = (
  id: string,
  startedAt: string,
  sets: { weightKg: number; reps: number }[],
): WorkoutSession => ({
  id,
  templateId: 'push-a',
  name: 'Push A',
  startedAt,
  completedAt: startedAt,
  status: 'completed',
  notes: '',
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  exercises: [{
    exerciseId: 'barbell-bench-press',
    sets: sets.map((set, index) => ({ setNumber: index + 1, ...set, rir: 2, doneAt: startedAt })),
  }],
});

function renderPage(path: string) {
  return render(
    <GymProvider>
      <SessionProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/program" element={<Program />} />
          <Route path="/exercises" element={<ExerciseLibrary />} />
          <Route path="/exercise/:exerciseId" element={<ExerciseDetail />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
      </SessionProvider>
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

describe('exercise name map', () => {
  // The dashboard reads the light map, the exercise pages read the catalogue, so
  // the two must not drift apart.
  it('matches the catalogue it stands in for', () => {
    expect(Object.keys(exerciseNames).sort()).toEqual(exercises.map((exercise) => exercise.id).sort());
    exercises.forEach((exercise) => expect(exerciseNames[exercise.id]).toBe(exercise.name));
  });

  it('uses the matching catalogue name for every admin-program movement', () => {
    for (const workout of adminPersonalProgram) {
      for (const item of workout.exercises) {
        const catalogId = adminExerciseCatalogId(item.exerciseId);
        const catalogExercise = exercises.find((exercise) => exercise.id === catalogId);
        expect(catalogExercise, item.exerciseId).toBeDefined();
        expect(item.name, item.exerciseId).toBe(catalogExercise?.name);
      }
    }
  });
});

describe('primary routes', () => {
  it.each([
    ['/', 'جلسهٔ بعدی'],
    ['/program', 'تقسیم‌بندی تمرین‌ها'],
    ['/exercises', 'آموزش حرکت‌ها'],
    ['/exercise/barbell-bench-press', 'شروع، حرکت، پایان.'],
    ['/exercise/admin-pec-deck', 'شروع، حرکت، پایان.'],
    ['/progress', 'دادهٔ واقعی · پیشرفت پیوسته'],
    ['/nutrition', 'سوخت تمرین'],
    ['/settings', 'برنامه را برای خودت تنظیم کن.'],
  ])('renders %s without a blank page', async (path, content) => {
    renderPage(path);
    expect(await screen.findByText(content)).toBeInTheDocument();
  });
});

describe('exercise library catalogue', () => {
  it('renders all exercises with English subtitle and supports bilingual search', async () => {
    const user = userEvent.setup();
    renderPage('/exercises');
    expect(await screen.findByText('پرس سینه با هالتر')).toBeInTheDocument();
    expect(screen.getByText('Barbell Bench Press')).toBeInTheDocument();

    // English search for 'squat'
    const searchInput = screen.getByPlaceholderText(/جست‌وجو بر اساس نام/);
    await user.type(searchInput, 'squat');
    expect(await screen.findByText('Barbell Back Squat')).toBeInTheDocument();
    expect(screen.queryByText('Barbell Bench Press')).not.toBeInTheDocument();
  });
});

describe('bodyweight and nutrition persistence', () => {
  it('saves a weigh-in and restores it after remounting', async () => {
    const user = userEvent.setup();
    const firstMount = renderPage('/progress');
    await screen.findByText('ثبت وزن');
    await user.type(screen.getByRole('spinbutton', { name: /وزن/ }), '78.4');
    await user.click(screen.getByRole('button', { name: /ذخیرهٔ وزن/ }));
    await waitFor(() => expect(db.bodyweights.count()).resolves.toBe(1));
    firstMount.unmount();

    renderPage('/progress');
    expect(await screen.findAllByText('۷۸٫۴ کیلوگرم')).not.toHaveLength(0);
  });

  it('charts logged weight, rep, and volume history for a selected exercise', async () => {
    const session: WorkoutSession = {
      id: 'history-fixture', templateId: 'push-a', name: 'Push A',
      startedAt: '2026-10-01T08:00:00.000Z', completedAt: '2026-10-01T09:00:00.000Z', status: 'completed', notes: '',
      currentExerciseIndex: 0, currentSetIndex: 0,
      exercises: [{ exerciseId: 'barbell-bench-press', sets: [
        { setNumber: 1, weightKg: 20, reps: 8, rir: 2, doneAt: '2026-10-01T08:10:00.000Z' },
        { setNumber: 2, weightKg: 20, reps: 7, rir: 2, doneAt: '2026-10-01T08:15:00.000Z' },
      ] }],
    };
    await db.sessions.put(session);
    const user = userEvent.setup();
    renderPage('/progress');
    const metric = await screen.findByRole('combobox', { name: 'انتخاب معیار نمودار' });
    expect(await screen.findByRole('img', { name: 'نمودار روند پرس سینه با هالتر · وزنهٔ کاری' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '۲۰ کیلوگرم × ۸' })).toBeInTheDocument();
    const historySummary = document.querySelector('.session-history-row');
    expect(historySummary?.tagName).toBe('SUMMARY');
    if (!historySummary) throw new Error('Session history disclosure is missing.');
    await user.click(historySummary);
    expect(await screen.findByText(/ست ۱: ۲۰ کیلوگرم × ۸ · ۲ تکرار در ذخیره/)).toBeInTheDocument();

    await user.selectOptions(metric, 'reps');
    expect(screen.getByRole('img', { name: 'نمودار روند پرس سینه با هالتر · مجموع تکرارها' })).toBeInTheDocument();
    await user.selectOptions(metric, 'volume');
    expect(screen.getByRole('img', { name: 'نمودار روند پرس سینه با هالتر · حجم تمرین' })).toBeInTheDocument();
  });

  it('shows long session and set histories in pages without losing older entries', async () => {
    await db.sessions.bulkPut(Array.from({ length: 45 }, (_, index) => completedSession(
      `history-${index}`, new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      [{ weightKg: 20, reps: 8 }, { weightKg: 21, reps: 8 }],
    )));
    await db.bodyweights.bulkPut(Array.from({ length: 15 }, (_, index) => ({ id: `weight-${index}`, date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10), weightKg: 70 + index })));
    const user = userEvent.setup();
    renderPage('/progress');
    await screen.findByText('سوابق تمرین');
    expect(document.querySelectorAll('.session-history-list details')).toHaveLength(20);
    expect(document.querySelectorAll('.history-table tbody tr')).toHaveLength(30);
    expect(document.querySelectorAll('.weight-log-list > div')).toHaveLength(10);
    await user.click(screen.getByRole('button', { name: 'نمایش ۵ ثبت وزن دیگر' }));
    expect(document.querySelectorAll('.weight-log-list > div')).toHaveLength(15);
    await user.click(screen.getByRole('button', { name: 'نمایش ۲۰ جلسهٔ دیگر' }));
    await user.click(screen.getByRole('button', { name: 'نمایش ۳۰ ست دیگر' }));
    expect(document.querySelectorAll('.session-history-list details')).toHaveLength(40);
    expect(document.querySelectorAll('.history-table tbody tr')).toHaveLength(60);
    await user.click(screen.getByRole('button', { name: 'نمایش ۵ جلسهٔ دیگر' }));
    await user.click(screen.getByRole('button', { name: 'نمایش ۳۰ ست دیگر' }));
    expect(document.querySelectorAll('.session-history-list details')).toHaveLength(45);
    expect(document.querySelectorAll('.history-table tbody tr')).toHaveLength(90);
  }, 15000);

  it('buckets completed sessions into Monday-start weeks, oldest first', () => {
    // Wednesday 2026-10-07 sits in the week that opened on Monday 2026-10-05.
    const now = new Date('2026-10-07T12:00:00.000Z');
    const weeks = getWeeklyTotals([
      completedSession('this-week', '2026-10-06T08:00:00.000Z', [{ weightKg: 60, reps: 10 }]),
      completedSession('last-week', '2026-09-30T08:00:00.000Z', [{ weightKg: 50, reps: 10 }, { weightKg: 50, reps: 8 }]),
      completedSession('too-old', '2026-06-01T08:00:00.000Z', [{ weightKg: 90, reps: 10 }]),
    ], 6, now);

    expect(weeks).toHaveLength(6);
    expect(weeks.at(-1)?.volumeKg).toBe(600);
    expect(weeks.at(-1)?.setCount).toBe(1);
    expect(weeks.at(-2)?.volumeKg).toBe(900);
    expect(weeks.at(-2)?.repCount).toBe(18);
    // Sessions older than the window are dropped rather than folded into a week.
    expect(weeks.reduce((sum, week) => sum + week.volumeKg, 0)).toBe(1500);
    expect(weeks[0]?.start.getTime()).toBeLessThan(weeks.at(-1)!.start.getTime());

    const comparison = getWeekComparison(weeks);
    expect(comparison?.volumeChange).toBe(-300);
    expect(comparison?.volumeChangePercent).toBeCloseTo(-33.33, 1);
    expect(comparison?.sessionChange).toBe(0);
    // An empty previous week gives no percentage instead of dividing by zero.
    expect(getWeekComparison(getWeeklyTotals([], 2, now))?.volumeChangePercent).toBeNull();
  });

  it('shows this week against last week on the progress page', async () => {
    await db.sessions.put(completedSession('week-a', '2026-10-06T08:00:00.000Z', [{ weightKg: 60, reps: 10 }]));
    await db.sessions.put(completedSession('week-b', '2026-09-29T08:00:00.000Z', [{ weightKg: 40, reps: 10 }]));
    renderPage('/progress');
    expect(await screen.findByText('هفته‌به‌هفته سبک‌تر یا سنگین‌تر؟')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'نمودار روند حجم هفتگی' })).toBeInTheDocument();
    const strip = document.querySelectorAll('.week-strip-row');
    expect(strip.length).toBe(6);
    expect(strip[0]?.textContent).toMatch(/کیلوگرم·تکرار/);
  });

  it('saves daily food notes without requiring calorie estimates', async () => {
    const user = userEvent.setup();
    renderPage('/nutrition');
    const notes = await screen.findByLabelText(/یادداشت خوراک/);
    await user.type(notes, 'Protein at lunch; steady appetite.');
    await user.click(screen.getByRole('button', { name: /ذخیرهٔ ثبت امروز/i }));

    await waitFor(async () => {
      const entry = await db.nutritionDays.get(getLocalDateKey());
      expect(entry?.notes).toBe('Protein at lunch; steady appetite.');
    });
  });
});
