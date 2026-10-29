import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({ id: 11 }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: { id: account.id, role: 'student' } }) }));

import { originalProgramCopy, setActiveProgram } from '../lib/programStore';
import * as persistence from '../lib/programPersistence';
import { ProgramEditor } from './ProgramEditor';

function sampleProgram() {
  const day = originalProgramCopy()[0]!;
  day.exercises = day.exercises.slice(0, 1);
  return [day];
}

function mount() {
  return render(<MemoryRouter initialEntries={['/program/edit']}>
    <Link to="/program">صفحهٔ برنامه</Link><Link to="/program/edit">بازگشت به ویرایش</Link>
    <Routes><Route path="/program/edit" element={<ProgramEditor />} /><Route path="/program" element={<p>نمای برنامه</p>} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => { sessionStorage.clear(); account.id = 11; setActiveProgram(sampleProgram()); });
afterEach(() => { vi.restoreAllMocks(); });

describe('personal programme recovery', () => {
  it('restores unsaved work after internal navigation without saving it as the active programme', async () => {
    mount();
    const user = userEvent.setup();
    fireEvent.change(screen.getAllByLabelText('نام روز')[0]!, { target: { value: 'پیش‌نویس شخصی' } });
    await screen.findByText(/نسخهٔ موقت فقط در همین زبانه است/);
    await user.click(screen.getByRole('link', { name: 'صفحهٔ برنامه' }));
    await user.click(screen.getByRole('link', { name: 'بازگشت به ویرایش' }));
    expect(await screen.findByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getAllByLabelText('نام روز')[0]).toHaveValue('پیش‌نویس شخصی');
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeEnabled();
  });

  it('warns when the saved programme changed and preserves both versions until a decision', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mount();
    const user = userEvent.setup();
    fireEvent.change(screen.getAllByLabelText('نام روز')[0]!, { target: { value: 'کار من' } });
    await user.click(screen.getByRole('link', { name: 'صفحهٔ برنامه' }));
    const remote = sampleProgram(); remote[0]!.name = 'نسخهٔ تازه'; setActiveProgram(remote);
    await user.click(screen.getByRole('link', { name: 'بازگشت به ویرایش' }));
    await user.click(await screen.findByRole('button', { name: 'ادامهٔ پیش‌نویس' }));
    expect(screen.getByText(/این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
    expect(screen.getAllByLabelText('نام روز')[0]).toHaveValue('کار من');
    await user.click(screen.getByRole('button', { name: 'استفاده از نسخهٔ تازه' }));
    expect(screen.getAllByLabelText('نام روز')[0]).toHaveValue('نسخهٔ تازه');
    expect(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' })).toBeDisabled();
  });

  it('isolates recovery by signed-in account within the same tab', async () => {
    const first = mount();
    fireEvent.change(screen.getAllByLabelText('نام روز')[0]!, { target: { value: 'متعلق به حساب اول' } });
    await screen.findByText(/نسخهٔ موقت فقط در همین زبانه است/);
    first.unmount();
    account.id = 12;
    const second = mount();
    expect(screen.queryByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('متعلق به حساب اول')).not.toBeInTheDocument();
    second.unmount();
    account.id = 11;
    mount();
    expect(await screen.findByText('پیش‌نویس ذخیره‌نشده پیدا شد.')).toBeInTheDocument();
  });

  it('does not allow changes while the local save is pending', async () => {
    let finish!: () => void;
    vi.spyOn(persistence, 'saveProgram').mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    mount();
    const day = screen.getAllByLabelText('نام روز')[0]!;
    fireEvent.change(day, { target: { value: 'در حال ذخیره' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    expect(day).toBeDisabled();
    finish();
    expect(await screen.findByText(/برنامه ذخیره شد/)).toBeInTheDocument();
    expect(day).toBeEnabled();
  });
});
