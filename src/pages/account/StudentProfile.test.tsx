import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('./AccountShell', () => ({
  PanelPage: ({ title, children }: { title: string; children: React.ReactNode }) => <section><h1>{title}</h1>{children}</section>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { StudentProfile } from './StudentProfile';

const sharedProfile = {
  studentName: 'مهدی',
  profile: {
    age: 28, sex: 'مرد', heightCm: 180, weightKg: 80,
    primaryGoal: 'افزایش قدرت', secondaryGoal: '', trainingExperience: 'مبتدی',
    trainingDays: 4, sessionMinutes: 60, dailyActivity: 'متوسط', sleepHours: '۷ ساعت',
    equipment: 'باشگاه', injuries: '', stressLevel: 0, workingWeightReferences: [],
  },
  updatedAt: '2026-10-24T10:15:00.000Z',
  shared: true,
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/coach/students/42/profile']}>
      <Routes><Route path="/coach/students/:studentId/profile" element={<StudentProfile />} /></Routes>
    </MemoryRouter>,
  );
}

describe('coach student profile status', () => {
  beforeEach(() => mocks.api.mockReset());
  afterEach(() => cleanup());

  it('shows active sharing and the last update timestamp', async () => {
    mocks.api.mockResolvedValue(sharedProfile);
    renderProfile();

    expect(await screen.findByText('اشتراک پروفایل فعال است')).toBeInTheDocument();
    expect(screen.getByText(/آخرین به‌روزرسانی:/)).toBeInTheDocument();
    expect(screen.getByText('۲۸ سال')).toBeInTheDocument();
  });

  it('refreshes and reflects when the student has disabled sharing', async () => {
    mocks.api.mockResolvedValueOnce(sharedProfile).mockResolvedValueOnce({
      studentName: 'مهدی', profile: null, updatedAt: null, shared: false,
    });
    renderProfile();

    expect(await screen.findByText('اشتراک پروفایل فعال است')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تازه‌سازی پروفایل شاگرد' }));

    expect(await screen.findByText('اشتراک پروفایل خاموش است')).toBeInTheDocument();
    await waitFor(() => expect(mocks.api).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('۲۸ سال')).not.toBeInTheDocument();
  });
});
