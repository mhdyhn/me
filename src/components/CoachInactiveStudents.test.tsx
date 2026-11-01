import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));

import { CoachInactiveStudents } from './CoachInactiveStudents';

const inactive = [
  {
    id: 31,
    displayName: 'سارا رضایی',
    username: 'sara.fit',
    lastSessionAt: '2026-10-20T08:00:00.000Z',
    daysSinceLastSession: 12,
    sessionsLast30Days: 1,
    hasProgramme: true,
  },
  {
    id: 32,
    displayName: 'نوید راستین',
    username: 'navid.r',
    lastSessionAt: null,
    daysSinceLastSession: null,
    sessionsLast30Days: 0,
    hasProgramme: false,
  },
];

describe('the coach report of inactive students', () => {
  beforeEach(() => {
    mocks.api.mockReset();
  });
  afterEach(() => cleanup());

  it('lists the students who stopped training with their links', async () => {
    mocks.api.mockResolvedValue({ students: inactive, inactiveDays: 7 });
    render(<MemoryRouter><CoachInactiveStudents /></MemoryRouter>);

    expect(await screen.findByText('سارا رضایی')).toBeInTheDocument();
    expect(screen.getByText('نوید راستین')).toBeInTheDocument();
    expect(screen.getByText(/۱۲ روز از آخرین تمرین گذشته/)).toBeInTheDocument();
    expect(screen.getByText('هنوز هیچ تمرینی ثبت نشده')).toBeInTheDocument();
    expect(screen.getByText(/برنامهٔ شما هنوز برای او فعال است/)).toBeInTheDocument();
    const progressLinks = screen.getAllByRole('link', { name: /پیشرفت/ });
    expect(progressLinks[0]!.getAttribute('href')).toBe('/coach/students/31/progress');
    const chatLinks = screen.getAllByRole('link', { name: /گفتگو/ });
    expect(chatLinks[0]!.getAttribute('href')).toBe('/coach/students/31/chat');
  });

  it('says so when every student trained recently', async () => {
    mocks.api.mockResolvedValue({ students: [], inactiveDays: 7 });
    render(<MemoryRouter><CoachInactiveStudents /></MemoryRouter>);

    expect(await screen.findByText(/هیچ شاگردی در ۷ روز اخیر بی‌تمرین نبوده است/)).toBeInTheDocument();
  });

  it('offers a retry when the report does not load', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ students: [], inactiveDays: 7 });
    render(<MemoryRouter><CoachInactiveStudents /></MemoryRouter>);

    expect(await screen.findByRole('alert')).toHaveTextContent('گزارش بی‌تمرینی بارگذاری نشد.');
    fireEvent.click(screen.getByRole('button', { name: /تلاش دوباره/ }));
    expect(await screen.findByText(/هیچ شاگردی در ۷ روز اخیر بی‌تمرین نبوده است/)).toBeInTheDocument();
  });
});
