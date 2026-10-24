import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  saveProfile: vi.fn(),
  getMyAiSettings: vi.fn(),
  profile: {
    age: 30,
    sex: '',
    heightCm: 180,
    weightKg: 80,
    primaryGoal: 'افزایش قدرت',
    secondaryGoal: '',
    trainingExperience: '',
    trainingDays: 4,
    sessionMinutes: 60,
    equipment: '',
    dailyActivity: '',
    sleepHours: '',
    stressLevel: 0,
    injuries: '',
    workingWeightReferences: [],
  },
}));

vi.mock('../lib/api', () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error {},
}));
vi.mock('../context/GymProvider', () => ({
  useGym: () => ({
    sessions: [], bodyweights: [], profile: mocks.profile, loading: false,
    saveProfile: mocks.saveProfile, activeSession: null,
    completeActiveSession: vi.fn(), deleteSession: vi.fn(),
  }),
}));
vi.mock('../context/SessionContext', () => ({
  useSession: () => ({ user: { id: 'student-sync-test', role: 'student' } }),
}));
vi.mock('../lib/programStore', () => ({ useProgram: () => [], getWorkoutTemplate: () => undefined, getPrimaryWorkoutTemplates: () => [] }));
vi.mock('../lib/studentAiBiometrics', () => ({ ALL_AI_MODULES: [], getMyAiSettings: mocks.getMyAiSettings }));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: 'آزمایش', subtitle: 'متن آزمایشی' }) }));

import { Dashboard } from './Dashboard';

describe('dashboard profile sync recovery', () => {
  beforeEach(() => {
    localStorage.setItem('meety:student-onboarding-skipped:student-sync-test', 'true');
    mocks.api.mockReset()
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ stored: null })
      .mockResolvedValueOnce({});
    mocks.saveProfile.mockReset().mockResolvedValue(undefined);
    mocks.getMyAiSettings.mockReset().mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    localStorage.removeItem('meety:student-onboarding-skipped:student-sync-test');
  });

  it('shows a network error and retries profile upload without another opt-in', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('همگام‌سازی پروفایل انجام نشد');
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }));

    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('PUT', '/me/profile', {
      profile: mocks.profile,
      shareWithCoach: true,
    }));
    expect(await screen.findByText(/پروفایل با حساب همگام است/)).toBeInTheDocument();
  });

  it('does not turn profile sharing back on after the student disabled it', async () => {
    mocks.api.mockReset().mockResolvedValue({ stored: { profile: mocks.profile, shareWithCoach: false } });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(await screen.findByText('آزمایش')).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(mocks.api).toHaveBeenCalledWith('GET', '/me/profile');
    expect(mocks.api).not.toHaveBeenCalledWith('PUT', '/me/profile', expect.anything());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
