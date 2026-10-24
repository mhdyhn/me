import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('./AccountShell', () => ({
  PanelPage: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  RequireRole: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../lib/aiHealthEngine', () => ({
  DEFAULT_HEALTH_METRICS: {},
  calculateReadinessScore: () => ({ color: '#fff', levelLabel: 'آماده', score: 80, recoveryTitle: 'وضعیت مناسب', coachRecommendation: 'ادامه بده' }),
  calculateMuscleRecovery: () => [],
}));
vi.mock('../../lib/studentDiagnostic', () => ({ runStudentDiagnostic: () => ({ statusColor: '#fff', statusLabel: 'ثابت' }) }));

import { StudentProgress } from './StudentProgress';

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

const sessions = [
  { id: 'recent', name: 'جلسهٔ این هفته', startedAt: daysAgo(2), completedAt: null, status: 'completed', notes: '', exercises: [] },
  { id: 'month', name: 'جلسهٔ این ماه', startedAt: daysAgo(20), completedAt: null, status: 'completed', notes: '', exercises: [] },
  { id: 'older', name: 'جلسهٔ قدیمی', startedAt: daysAgo(60), completedAt: null, status: 'completed', notes: '', exercises: [] },
];

describe('coach student progress date ranges', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.api.mockResolvedValue({ studentName: 'مهدی', sessions });
  });
  afterEach(() => cleanup());

  it('limits displayed sessions to the selected range and includes all recorded sessions', async () => {
    render(
      <MemoryRouter initialEntries={['/coach/students/42/progress']}>
        <Routes><Route path="/coach/students/:studentId/progress" element={<StudentProgress />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('جلسهٔ این هفته')).toBeInTheDocument();
    expect(screen.getByText('جلسهٔ این ماه')).toBeInTheDocument();
    expect(screen.getByText('جلسهٔ قدیمی')).toBeInTheDocument();

    const range = screen.getByRole('combobox', { name: 'بازهٔ زمانی' });
    fireEvent.change(range, { target: { value: '7d' } });
    expect(screen.getByText('جلسهٔ این هفته')).toBeInTheDocument();
    expect(screen.queryByText('جلسهٔ این ماه')).not.toBeInTheDocument();
    expect(screen.queryByText('جلسهٔ قدیمی')).not.toBeInTheDocument();

    fireEvent.change(range, { target: { value: '30d' } });
    expect(screen.getByText('جلسهٔ این ماه')).toBeInTheDocument();
    expect(screen.queryByText('جلسهٔ قدیمی')).not.toBeInTheDocument();

    fireEvent.change(range, { target: { value: 'all' } });
    expect(screen.getByText('جلسهٔ قدیمی')).toBeInTheDocument();
  });
});
