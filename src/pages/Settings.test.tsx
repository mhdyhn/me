import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  api: vi.fn(), saveProfile: vi.fn(),
  profile: { age: 28, sex: 'مرد', heightCm: 180, weightKg: 80, primaryGoal: 'قدرت', secondaryGoal: '', trainingDays: 4, sessionMinutes: 60, trainingExperience: 'مبتدی', sleepHours: '۷ ساعت', dailyActivity: 'متوسط', stressLevel: 3, injuries: '', workingWeightReferences: [] },
  sessions: [] as unknown[], bodyweights: [] as unknown[], nutritionDays: [] as unknown[], nutritionGoals: {},
}));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../context/GymProvider', () => ({
  useGym: () => ({
    profile: mocks.profile,
    sessions: mocks.sessions, bodyweights: mocks.bodyweights, nutritionDays: mocks.nutritionDays, nutritionGoals: mocks.nutritionGoals, saveProfile: mocks.saveProfile,
  }),
}));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: { id: 12, role: 'student' } }) }));

import { Settings } from './Settings';

describe('settings profile sharing status', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.saveProfile.mockReset();
  });
  afterEach(() => cleanup());

  it('keeps sharing controls disabled after a load error and retries successfully', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      stored: { profile: {}, shareWithCoach: true },
    });
    render(<Settings />);

    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    expect(await screen.findByText('وضعیت همگام‌سازی با سرور بارگذاری نشد.')).toBeInTheDocument();
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری' }));
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).toBeChecked();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
});
