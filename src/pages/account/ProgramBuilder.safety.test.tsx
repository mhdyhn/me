import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../../context/SessionContext';
import { ProgramBuilder } from './ProgramBuilder';

const coach = { id: 2, username: 'coach', role: 'coach', displayName: 'مربی', coachId: null, mustChangePassword: false };
const studentA = { id: 3, username: 'a', role: 'student', displayName: 'شاگرد الف', coachId: 2, mustChangePassword: false };
const studentB = { id: 4, username: 'b', role: 'student', displayName: 'شاگرد ب', coachId: 2, mustChangePassword: false };
const programA = { id: 'offer-a', version: 2, title: 'فقط برای الف', priceTomans: 250000, updatedAt: 'now', days: [{ name: 'روز الف', exercises: [{ exerciseId: 'a-b', name: 'حرکت', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }] };
const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

function renderBuilder() {
  return render(<SessionProvider><MemoryRouter initialEntries={['/coach/students/3/program']}>
    <Link to="/coach/students/3/program">رفتن به الف</Link><Link to="/coach/students/4/program">رفتن به ب</Link>
    <Routes><Route path="/coach/students/:studentId/program" element={<ProgramBuilder />} /></Routes>
  </MemoryRouter></SessionProvider>);
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('meety.session-token', 'coach-token'); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('student-specific programme editor safety', () => {
  it('does not carry one student’s programme or price into another student with no programme', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      if (path === '/api/students/4/program?accountId=2') return response({ program: null, student: studentB });
      return response({});
    }));
    renderBuilder();
    const user = userEvent.setup();
    expect(await screen.findByDisplayValue('فقط برای الف')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    await screen.findByText('برنامهٔ شاگرد ب');
    expect(screen.getByLabelText('عنوان برنامه')).toHaveValue('');
    expect(screen.queryByDisplayValue('روز الف')).not.toBeInTheDocument();
    await user.click(screen.getByText('تنظیمات قیمت'));
    expect(screen.getByLabelText('هزینهٔ برنامه (تومان)')).toHaveValue(null);
  });

  it('ignores a late fallback roster response after switching to another student', async () => {
    let releaseRoster!: (value: Response) => void;
    const pendingRoster = new Promise<Response>((resolve) => { releaseRoster = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA });
      if (path === '/api/students/4/program?accountId=2') return response({ program: null, student: studentB });
      if (path === '/api/students') return pendingRoster;
      return response({});
    }));
    renderBuilder();
    const user = userEvent.setup();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/students', expect.anything()));
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    await screen.findByText('برنامهٔ شاگرد ب');
    releaseRoster(response({ students: [studentA, studentB] }));
    await waitFor(() => expect(screen.getByLabelText('عنوان برنامه')).toHaveValue(''));
    expect(screen.getByText('برنامهٔ شاگرد ب')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('فقط برای الف')).not.toBeInTheDocument();
  });

  it('keeps a student-specific draft across navigation and asks before restoring it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      if (path === '/api/students/4/program?accountId=2') return response({ program: null, student: studentB });
      return response({});
    }));
    renderBuilder();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('عنوان برنامه'), { target: { value: 'پیش‌نویس الف' } });
    await screen.findByText(/نسخهٔ موقت فقط در همین زبانه است/);
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    await screen.findByText('برنامهٔ شاگرد ب');
    expect(screen.getByLabelText('عنوان برنامه')).toHaveValue('');
    await user.click(screen.getByRole('link', { name: 'رفتن به الف' }));
    expect(await screen.findByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByLabelText('عنوان برنامه')).toHaveValue('پیش‌نویس الف');
    expect(screen.getByDisplayValue('روز الف')).toBeInTheDocument();
  });

  it('keeps a stale draft but requires a decision before replacing a newer version', async () => {
    let active = programA;
    let savedBody: Record<string, unknown> | null = null;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program' && init?.method === 'PUT') {
        savedBody = JSON.parse(String(init.body));
        return response({ program: { ...active, ...savedBody, version: 4 } });
      }
      if (path === '/api/students/3/program?accountId=2') return response({ program: active, student: studentA });
      if (path === '/api/students/4/program?accountId=2') return response({ program: null, student: studentB });
      return response({});
    }));
    renderBuilder();
    const user = userEvent.setup();
    fireEvent.change(await screen.findByLabelText('عنوان برنامه'), { target: { value: 'کار من' } });
    await user.click(screen.getByRole('link', { name: 'رفتن به ب' }));
    await screen.findByText('برنامهٔ شاگرد ب');
    active = { ...programA, version: 3, title: 'نسخهٔ دستگاه دیگر' };
    await user.click(screen.getByRole('link', { name: 'رفتن به الف' }));
    await user.click(await screen.findByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByText(/برنامهٔ فعال پس از ساخت این پیش‌نویس تغییر کرده/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
    expect(screen.getByLabelText('عنوان برنامه')).toHaveValue('کار من');
    await user.click(screen.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }));
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await screen.findByText(/برنامه ذخیره شد/);
    expect(savedBody).toMatchObject({ title: 'کار من', expectedId: 'offer-a', expectedVersion: 3, saveMode: 'edit' });
    expect(sessionStorage.getItem('meety:session-draft:coach-program:2:3')).toBeNull();
  });

  it('does not overwrite an unreadable draft until the user explicitly discards it', async () => {
    const key = 'meety:session-draft:coach-program:2:3';
    sessionStorage.setItem(key, '{unreadable');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      return response({});
    }));
    renderBuilder();
    const user = userEvent.setup();
    expect(await screen.findByText('پیش‌نویس قبلی قابل خواندن نیست.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'کنار گذاشتن پیش‌نویس' }));
    expect(sessionStorage.getItem(key)).toBe('{unreadable');
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'کنار گذاشتن پیش‌نویس' }));
    expect(await screen.findByDisplayValue('فقط برای الف')).toBeInTheDocument();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('warns if a browser refuses to keep the recovery copy', async () => {
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (this === sessionStorage && key.startsWith('meety:session-draft')) throw new Error('quota');
      return original.call(this, key, value);
    });
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      return response({});
    }));
    renderBuilder();
    fireEvent.change(await screen.findByLabelText('عنوان برنامه'), { target: { value: 'دادهٔ تازه' } });
    expect(await screen.findByText(/نگهداری نسخهٔ موقت در مرورگر ممکن نشد/)).toBeInTheDocument();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByLabelText('عنوان برنامه')).toHaveValue('دادهٔ تازه');
  });


  it('freezes edits until the submitted programme has completed saving', async () => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      if (path === '/api/students/3/program' && init?.method === 'PUT') return pending;
      return response({});
    }));
    renderBuilder();
    const title = await screen.findByLabelText('عنوان برنامه');
    fireEvent.change(title, { target: { value: 'نسخهٔ ارسالی' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    expect(title).toBeDisabled();
    expect(screen.getByRole('radio', { name: /ثبت برنامهٔ جدید/ })).toBeDisabled();
    finish(response({ program: { ...programA, version: 3, title: 'نسخهٔ ارسالی' } }));
    expect(await screen.findByText(/برنامه ذخیره شد/)).toBeInTheDocument();
    expect(title).toBeEnabled();
  });

  it('fetches a newer version after a rejected save without discarding the current draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let active = programA;
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: active, student: studentA });
      if (path === '/api/students/3/program' && init?.method === 'PUT') {
        active = { ...programA, version: 3, title: 'نسخهٔ تازه' };
        return new Response(JSON.stringify({ error: 'نسخه تغییر کرده' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      return response({});
    }));
    renderBuilder();
    const title = await screen.findByLabelText('عنوان برنامه');
    fireEvent.change(title, { target: { value: 'پیش‌نویس من' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'دریافت نسخهٔ تازه بدون حذف پیش‌نویس' }));
    expect(await screen.findByText(/برنامهٔ فعال پس از ساخت این پیش‌نویس تغییر کرده/)).toBeInTheDocument();
    expect(title).toHaveValue('پیش‌نویس من');
    expect(screen.getByText('نسخهٔ تازه')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
  });

  it('keeps a programme draft after a malformed successful save response and requires a fresh read', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      if (path === '/api/students/3/program' && init?.method === 'PUT') return response({});
      return response({});
    }));
    renderBuilder();
    const title = await screen.findByLabelText('عنوان برنامه');
    fireEvent.change(title, { target: { value: 'پیش‌نویس من' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    expect(await screen.findByRole('button', { name: 'دریافت نسخهٔ تازه بدون حذف پیش‌نویس' })).toBeInTheDocument();
    expect(title).toHaveValue('پیش‌نویس من');
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
    expect(screen.queryByText(/برنامه ذخیره شد/)).not.toBeInTheDocument();
  });

  it('does not treat a malformed initial programme response as an empty programme', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path === '/api/me' ? response({ user: coach }) : response({ student: studentA })));
    renderBuilder();
    expect(await screen.findByRole('button', { name: 'تلاش دوباره برای بارگذاری برنامه' })).toBeInTheDocument();
    expect(screen.queryByLabelText('عنوان برنامه')).not.toBeInTheDocument();
  });

  it('blocks further changes after an archive activation returns an invalid success response', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const previous = { ...programA, id: 'old-offer', version: 1, title: 'برنامهٔ قبلی' };
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: programA, student: studentA });
      if (path === '/api/students/3/programs/archive?accountId=2') return response({ programs: [previous], nextCursor: null });
      if (path === '/api/students/3/programs/restore' && init?.method === 'POST') return response({});
      return response({});
    }));
    renderBuilder();
    const title = await screen.findByLabelText('عنوان برنامه');
    fireEvent.change(title, { target: { value: 'پیش‌نویس مربی' } });
    await userEvent.setup().click(screen.getByText('برنامه‌های قبلی این شاگرد'));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'فعال‌کردن این برنامه' }));
    expect(await screen.findByRole('button', { name: 'دریافت نسخهٔ تازه بدون حذف پیش‌نویس' })).toBeInTheDocument();
    expect(title).toHaveValue('پیش‌نویس مربی');
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'فعال‌کردن این برنامه' })).toBeDisabled();
  });

  it('keeps migrated legacy programmes with version zero editable', async () => {
    const legacy = { ...programA, id: 'legacy-3', version: 0 };
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/me') return response({ user: coach });
      if (path === '/api/students/3/program?accountId=2') return response({ program: legacy, student: studentA });
      return response({});
    }));
    renderBuilder();
    expect(await screen.findByDisplayValue(legacy.title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeEnabled();
  });

});
