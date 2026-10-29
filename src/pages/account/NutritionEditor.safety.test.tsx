import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../../lib/api', () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock('../../context/SessionContext', () => ({ useSession: () => ({ status: 'signedIn', user: { id: 2, role: 'coach', displayName: 'مربی', isActive: true }, signOut: vi.fn() }) }));

import { NutritionEditor } from './NutritionEditor';
import { ApiError } from '../../lib/api';
import { emptyPlan } from '../../../server/nutrition';
import { getLocalDateKey } from '../../lib/format';

const studentA = { id: 3, displayName: 'شاگرد الف' };
const studentB = { id: 4, displayName: 'شاگرد ب' };
const weekA = { ...emptyPlan(), targets: { ...emptyPlan().targets, kcal: 2100 } };

function mount() {
  return render(<MemoryRouter initialEntries={['/coach/students/3/nutrition']}>
    <Link to="/coach/students/3/nutrition">رفتن به الف</Link><Link to="/coach/students/4/nutrition">رفتن به ب</Link>
    <Routes><Route path="/coach/students/:studentId/nutrition" element={<NutritionEditor />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => { mocks.api.mockReset(); sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('coach nutrition editor safety', () => {
  it('shows a retryable error instead of claiming that an unavailable diary is empty', async () => {
    let attempts = 0;
    mocks.api.mockImplementation(async (method: string, path: string) => {
      if (path === '/students') return { students: [studentA] };
      if (path.split('?')[0]!.endsWith('/nutrition')) return { plan: weekA };
      if (path.includes('/diary/')) {
        attempts += 1;
        if (attempts === 1) throw new Error('offline');
        return { diary: { day: getLocalDateKey(), meals: [], updatedAt: null } };
      }
      throw new Error(`${method} ${path}`);
    });
    mount();
    await userEvent.setup().click(await screen.findByRole('tab', { name: /دفتر خوراک ثبت‌شده/ }));
    expect(await screen.findByText('دفتر خوراک شاگرد بارگذاری نشد.')).toBeInTheDocument();
    expect(screen.queryByText('شاگرد هنوز برای این تاریخ وعده‌ای در دفتر خود ثبت نکرده است.')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'تلاش دوباره برای دریافت دفتر خوراک' }));
    expect(await screen.findByText('شاگرد هنوز برای این تاریخ وعده‌ای در دفتر خود ثبت نکرده است.')).toBeInTheDocument();
  });

  it('does not allow more edits while a weekly plan save is pending', async () => {
    let finishSave!: (value: unknown) => void;
    const pending = new Promise((resolve) => { finishSave = resolve; });
    mocks.api.mockImplementation((method: string, path: string) => {
      if (path === '/students') return Promise.resolve({ students: [studentA] });
      if (path.split('?')[0]!.endsWith('/nutrition') && method === 'GET') return Promise.resolve({ plan: weekA });
      if (path.split('?')[0]!.endsWith('/nutrition') && method === 'PUT') return pending;
      return Promise.reject(new Error('unexpected'));
    });
    mount();
    const calories = await screen.findByRole('spinbutton', { name: /کالری/ });
    fireEvent.change(calories, { target: { value: '2200' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }));
    expect(calories).toBeDisabled();
    expect(screen.getByLabelText('نام وعده')).toBeDisabled();
    finishSave({ plan: { ...weekA, targets: { ...weekA.targets, kcal: 2200 }, updatedAt: 'now' } });
    expect(await screen.findByText('برنامه ذخیره شد.')).toBeInTheDocument();
    expect(calories).toBeEnabled();
  });

  it('hides the first student’s plan while loading the second student', async () => {
    let finishSecond!: (value: unknown) => void;
    const pending = new Promise((resolve) => { finishSecond = resolve; });
    mocks.api.mockImplementation((method: string, path: string) => {
      if (path === '/students') return Promise.resolve({ students: [studentA, studentB] });
      if (path.split('?')[0] === '/students/3/nutrition') return Promise.resolve({ plan: weekA });
      if (path.split('?')[0] === '/students/4/nutrition') return pending;
      return Promise.reject(new Error(`${method} ${path}`));
    });
    mount();
    expect(await screen.findByDisplayValue('2100')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: 'رفتن به ب' }));
    expect(screen.queryByDisplayValue('2100')).not.toBeInTheDocument();
    finishSecond({ plan: emptyPlan() });
    await waitFor(() => expect(screen.getByText('تغذیهٔ شاگرد ب')).toBeInTheDocument());
    expect(screen.getByRole('spinbutton', { name: /کالری/ })).toHaveValue(null);
  });

  it('preserves a weekly draft between students and restores it only for the right student', async () => {
    mocks.api.mockImplementation(async (_method: string, path: string) => {
      if (path === '/students') return { students: [studentA, studentB] };
      if (path.split('?')[0] === '/students/3/nutrition') return { plan: weekA };
      if (path.split('?')[0] === '/students/4/nutrition') return { plan: emptyPlan() };
      throw new Error('unexpected');
    });
    mount();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByRole('spinbutton', { name: /کالری/ }), { target: { value: '2200' } });
    await screen.findByText(/نسخهٔ موقت فقط در همین زبانه است/);
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    expect(await screen.findByText('تغذیهٔ شاگرد ب')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: /کالری/ })).toHaveValue(null);
    await user.click(screen.getByRole('link', { name: 'رفتن به الف' }));
    expect(await screen.findByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByRole('spinbutton', { name: /کالری/ })).toHaveValue(2200);
  });

  it('blocks a stale weekly save and requires review of the other device’s version', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let remote = structuredClone(weekA);
    const writes: Array<{ accountId: number; expectedPlan: typeof weekA; targets: typeof weekA.targets }> = [];
    mocks.api.mockImplementation(async (method: string, path: string, body?: typeof writes[number]) => {
      if (path === '/students') return { students: [studentA] };
      if (method === 'GET') return { plan: remote };
      writes.push(body!);
      if (JSON.stringify(body!.expectedPlan.targets) !== JSON.stringify(remote.targets)) throw new ApiError(409, 'تعارض');
      remote = { ...remote, targets: body!.targets, updatedAt: 'saved' };
      return { plan: remote };
    });
    mount();
    const calories = await screen.findByRole('spinbutton', { name: /کالری/ });
    fireEvent.change(calories, { target: { value: '2200' } });
    remote = { ...remote, targets: { ...remote.targets, kcal: 2300 }, updatedAt: 'newer' };
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }));
    expect(await screen.findByText(/این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است/)).toBeInTheDocument();
    expect(calories).toHaveValue(2200);
    expect(screen.getByText(/۲٬۳۰۰ کیلوکالری/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' })).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }));
    expect(await screen.findByText('برنامه ذخیره شد.')).toBeInTheDocument();
    expect(writes[1]).toMatchObject({ accountId: 2, expectedPlan: { targets: { kcal: 2300 } }, targets: { kcal: 2200 } });
  });

  it('blocks a recovered weekly draft when its original base is stale', async () => {
    let remote = structuredClone(weekA);
    mocks.api.mockImplementation(async (_method: string, path: string) => path === '/students' ? { students: [studentA, studentB] }
      : path.split('?')[0] === '/students/3/nutrition' ? { plan: remote } : { plan: emptyPlan() });
    mount();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByRole('spinbutton', { name: /کالری/ }), { target: { value: '2200' } });
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    await screen.findByText('تغذیهٔ شاگرد ب');
    remote = { ...remote, targets: { ...remote.targets, kcal: 2300 } };
    await user.click(screen.getByRole('link', { name: 'رفتن به الف' }));
    await user.click(await screen.findByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByRole('spinbutton', { name: /کالری/ })).toHaveValue(2200);
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' })).toBeDisabled();
    expect(screen.getByText(/۲٬۳۰۰ کیلوکالری/)).toBeInTheDocument();
  });

  it('does not lose a weekly draft after a malformed successful save response', async () => {
    let loads = 0;
    mocks.api.mockImplementation(async (method: string, path: string) => {
      if (path === '/students') return { students: [studentA] };
      if (method === 'PUT') return {}; // The server may have saved; the outcome is unknown.
      loads += 1;
      if (loads === 1) return { plan: weekA };
      throw new ApiError(0, 'دریافت نسخهٔ تازه ناموفق است.');
    });
    mount();
    const calories = await screen.findByRole('spinbutton', { name: /کالری/ });
    fireEvent.change(calories, { target: { value: '2200' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }));
    expect(await screen.findByText('دریافت نسخهٔ تازه ناموفق است.')).toBeInTheDocument();
    expect(calories).toHaveValue(2200);
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'دریافت نسخهٔ تازه' })).toBeInTheDocument();
  });

  it('shows a retryable error for a malformed initial weekly plan', async () => {
    mocks.api.mockImplementation(async (_method: string, path: string) => path === '/students' ? { students: [studentA] } : {});
    mount();
    expect(await screen.findByRole('button', { name: 'تلاش دوباره برای بارگذاری برنامه' })).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton', { name: /کالری/ })).not.toBeInTheDocument();
  });

});
