import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ getBiometrics: vi.fn(), saveBiometrics: vi.fn(), api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../lib/studentAiBiometrics', () => ({
  ALL_AI_MODULES: ['readiness'],
  AI_MODULES_INFO: { readiness: { title: 'آمادگی', subtitle: 'ریکاوری', color: '#8abc45', description: 'تنظیم دسترسی' } },
  calculateHeartRateZones: () => [],
  calculateMaxHeartRate: () => 180,
  getStudentBiometrics: mocks.getBiometrics,
  saveStudentBiometricsApi: mocks.saveBiometrics,
}));
vi.mock('../../lib/studentDiagnostic', () => ({ runStudentDiagnostic: () => null }));
vi.mock('./AccountShell', () => ({
  PanelPage: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { StudentAiSettings } from './StudentAiSettings';

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={['/coach/students/42/ai']}>
      <Routes><Route path="/coach/students/:studentId/ai" element={<StudentAiSettings />} /></Routes>
    </MemoryRouter>,
  );
}

describe('coach student AI settings loading', () => {
  beforeEach(() => {
    mocks.getBiometrics.mockReset();
    mocks.saveBiometrics.mockReset();
    mocks.api.mockReset().mockResolvedValue({ studentName: 'مهدی', sessions: [] });
  });
  afterEach(() => cleanup());

  it('offers retry after the initial load fails and does not expose editable defaults', async () => {
    mocks.getBiometrics.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      enabledModules: ['readiness'], age: 25, restingHr: 60, maxHrMethod: 'tanaka', maxHr: 180, limitations: '',
    });
    renderSettings();

    expect(await screen.findByText('بارگذاری تنظیمات انجام نشد.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ذخیره تنظیمات هوش مصنوعی/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری' }));

    expect(await screen.findByRole('button', { name: /ذخیره تنظیمات هوش مصنوعی/ })).toBeEnabled();
    expect(mocks.getBiometrics).toHaveBeenCalledTimes(2);
  });

  it('does not show a default heart rate as a personal measurement or save an empty custom peak', async () => {
    mocks.getBiometrics.mockResolvedValue({
      enabledModules: ['readiness'], age: null, restingHr: null, maxHrMethod: 'tanaka', maxHr: 190, limitations: '',
    });
    renderSettings();
    expect(await screen.findByText(/سن معتبر یا ضربان بیشینهٔ ثبت‌شده لازم است/)).toBeInTheDocument();
    expect(screen.queryByText('۱۸۰ ضربه در دقیقه (BPM)')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('روش محاسبه حداکثر ضربان (HR Max)'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیره تنظیمات هوش مصنوعی/ }));
    expect(screen.getByText(/برای روش ثبت مستقیم، ضربان بیشینهٔ معتبر/)).toBeInTheDocument();
    expect(mocks.saveBiometrics).not.toHaveBeenCalled();
  });

});
