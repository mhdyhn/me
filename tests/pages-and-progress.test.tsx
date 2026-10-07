import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GymProvider } from '../src/context/GymProvider';
import { Dashboard } from '../src/pages/Dashboard';
import { ExerciseDetail } from '../src/pages/ExerciseDetail';
import { ExerciseLibrary } from '../src/pages/ExerciseLibrary';
import { Nutrition } from '../src/pages/Nutrition';
import { Program } from '../src/pages/Program';
import { Progress } from '../src/pages/Progress';
import { Settings } from '../src/pages/Settings';
import { db } from '../src/lib/db';
import { getLocalDateKey } from '../src/lib/format';
import type { WorkoutSession } from '../src/types';

function renderPage(path: string) {
  return render(
    <GymProvider>
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

describe('primary routes', () => {
  it.each([
    ['/', 'جلسهٔ بعدی'],
    ['/program', 'تقسیم‌بندی تمرین‌ها'],
    ['/exercises', 'آموزش حرکت‌ها'],
    ['/exercise/barbell-bench-press', 'شروع، حرکت، پایان.'],
    ['/progress', 'دادهٔ واقعی · پیشرفت پیوسته'],
    ['/nutrition', 'سوخت تمرین'],
    ['/settings', 'پروفایل شما · خصوصی از ابتدا'],
  ])('renders %s without a blank page', async (path, content) => {
    renderPage(path);
    expect(await screen.findByText(content)).toBeInTheDocument();
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
