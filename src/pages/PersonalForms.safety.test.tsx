import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { sampleNutritionGoals, sampleProfile } from '../../tests/fixtures/profile';
import { blankNutritionGoals, blankProfile } from '../data/profile';
import { Nutrition } from './Nutrition';
import { Settings } from './Settings';

const mocks = vi.hoisted(() => ({
  gym: {} as Record<string, unknown>,
  user: { id: 5, role: 'student', coachId: 4, coachAccess: true },
  api: vi.fn(), saveGoals: vi.fn(), saveDay: vi.fn(), saveProfile: vi.fn(),
}));
vi.mock('../context/GymProvider', () => ({ useGym: () => mocks.gym }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user }) }));
vi.mock('../lib/api', () => ({ ApiError: class extends Error {}, api: mocks.api }));
vi.mock('./account/MealDiary', () => ({ MealDiary: () => null }));
vi.mock('./account/StudentNutrition', () => ({ StudentNutritionPlan: () => null, CoachNutritionArchive: () => null }));
vi.mock('../components/PersonalDataPanel', () => ({ PersonalDataPanel: () => null }));
vi.mock('../components/FormerCoachRecords', () => ({ FormerCoachRecords: () => null }));
vi.mock('../components/InstallAppModal', () => ({ InstallAppModal: () => null }));

function deferred() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.api.mockReset().mockResolvedValue({ stored: { shareWithCoach: false }, sharingVersion: 0 });
  mocks.saveGoals.mockReset(); mocks.saveDay.mockReset(); mocks.saveProfile.mockReset();
  mocks.gym = { profile: sampleProfile, nutritionGoals: sampleNutritionGoals, sessions: [], bodyweights: [], nutritionDays: [], loading: false,
    saveNutritionGoals: mocks.saveGoals, saveNutritionDay: mocks.saveDay, saveProfile: mocks.saveProfile };
});

it('starts with no weight or protein target and can save only a calorie target', async () => {
  mocks.gym = { ...mocks.gym, profile: blankProfile, nutritionGoals: blankNutritionGoals };
  mocks.saveGoals.mockResolvedValue(true);
  render(<Nutrition />);
  expect(screen.getByRole('spinbutton', { name: /پروتئین/ })).toHaveValue(null);
  expect(screen.getByText(/برای دیدن بازهٔ تقریبی پروتئین/)).toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: /هدف کالری/ }), { target: { value: '1800' } });
  const button = screen.getByRole('button', { name: /ذخیرهٔ هدف‌ها/ });
  await act(async () => { fireEvent.submit(button.closest('form')!); });
  expect(mocks.saveGoals).toHaveBeenCalledWith(expect.objectContaining({ dailyCalories: 1800, proteinG: 0 }), expect.objectContaining({ proteinG: 0 }));
  expect(screen.getByRole('spinbutton', { name: /پروتئین/ })).toHaveValue(null);
});

it('locks daily targets during a slow local save and ignores repeated submits', async () => {
  const request = deferred(); mocks.saveGoals.mockReturnValue(request.promise);
  render(<Nutrition />);
  const protein = screen.getByRole('spinbutton', { name: /پروتئین/ });
  fireEvent.change(protein, { target: { value: '120' } });
  const button = screen.getByRole('button', { name: /ذخیرهٔ هدف‌ها/ });
  fireEvent.submit(button.closest('form')!); fireEvent.submit(button.closest('form')!);
  expect(mocks.saveGoals).toHaveBeenCalledTimes(1);
  expect(protein).toBeDisabled();
  expect(button).toBeDisabled();
  await act(async () => request.resolve(true));
  expect(protein).not.toBeDisabled();
  expect(protein).toHaveValue(120);
});

it('locks today’s note until the save resolves and allows retry after failure', async () => {
  const request = deferred(); mocks.saveDay.mockReturnValue(request.promise);
  render(<Nutrition />);
  const note = screen.getByRole('textbox', { name: /یادداشت خوراک/ });
  fireEvent.change(note, { target: { value: 'یادداشت باقی بماند' } });
  const button = screen.getByRole('button', { name: /ذخیرهٔ ثبت امروز/ });
  fireEvent.submit(button.closest('form')!); fireEvent.submit(button.closest('form')!);
  expect(mocks.saveDay).toHaveBeenCalledTimes(1);
  expect(note).toBeDisabled(); expect(button).toBeDisabled();
  await act(async () => request.resolve(false));
  expect(note).toHaveValue('یادداشت باقی بماند');
  expect(note).not.toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('ذخیره روی دستگاه انجام نشد');
});

it('does not allow consent or profile to change while the profile save is in flight', async () => {
  const request = deferred(); mocks.saveProfile.mockReturnValue(request.promise);
  mocks.api.mockResolvedValueOnce({ stored: { shareWithCoach: false }, sharingVersion: 0 }).mockResolvedValueOnce({ stored: { shareWithCoach: true } });
  render(<Settings />);
  const share = await screen.findByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
  await act(async () => {});
  fireEvent.click(share);
  const button = screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ });
  fireEvent.submit(button.closest('form')!); fireEvent.submit(button.closest('form')!);
  expect(mocks.saveProfile).toHaveBeenCalledTimes(1);
  expect(share).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: 'سن' })).toBeDisabled();
  await act(async () => request.resolve(true));
  expect(mocks.api).toHaveBeenCalledWith('PUT', '/me/profile', expect.objectContaining({ accountId: 5, shareWithCoach: true }));
  expect(share).not.toBeDisabled();
});
