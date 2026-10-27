import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymProvider } from '../context/GymProvider';
import { SessionProvider } from '../context/SessionContext';
import { setActiveProgram, setAssignedProgram, originalProgramCopy } from '../lib/programStore';
import { db } from '../lib/db';
import { Program } from './Program';

function renderProgram() {
  return render(
    <GymProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={['/program']}>
          <Routes>
            <Route path="/program" element={<Program />} />
            <Route path="/program/edit" element={<div>صفحه ویرایشگر برنامه</div>} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </GymProvider>,
  );
}

beforeEach(async () => {
  window.localStorage.clear();
  const program = originalProgramCopy();
  await db.preferences.clear();
  await db.preferences.put({ key: 'programTemplates', value: program });
  setActiveProgram(program);
});

describe('manager program management', () => {
  it('renders manager action bar with new program, edit, and delete options', () => {
    renderProgram();
    expect(screen.getByText('نسخهٔ مدیریت برنامه')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تعریف برنامه جدید/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ویرایش برنامه/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /حذف برنامه/ })).toBeInTheDocument();
  });

  it('opens template modal when defining a new program', async () => {
    renderProgram();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /تعریف برنامه جدید/ }));
    expect(await screen.findByRole('heading', { name: 'تعریف برنامهٔ تمرینی جدید' })).toBeInTheDocument();
    expect(screen.getByText(/برنامهٔ ۳ روزه فول بادی/)).toBeInTheDocument();
    expect(screen.getByText(/برنامهٔ ۴ روزه بالاتنه \/ پایین‌تنه/)).toBeInTheDocument();
    expect(screen.getByText(/برنامهٔ ۵ روزه تفکیکی/)).toBeInTheDocument();
  });

  it('deletes active program when confirmed in modal', async () => {
    renderProgram();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /حذف برنامه/ }));
    expect(await screen.findByRole('heading', { name: 'حذف کامل برنامهٔ تمرینی' })).toBeInTheDocument();

    const confirmDeleteBtn = screen.getByRole('button', { name: /بله، برنامه حذف شود/ });
    await user.click(confirmDeleteBtn);

    expect(await screen.findByText(/برنامهٔ تمرینی فعلی با موفقیت حذف شد/)).toBeInTheDocument();
    expect(screen.getByText('هنوز برنامه‌ای تعریف نشده است')).toBeInTheDocument();
  });

  it('applies a preset template to replace or start a program', async () => {
    // Start with empty program, both in the store and the persisted account data.
    await db.preferences.put({ key: 'programTemplates', value: [] });
    setActiveProgram([]);
    renderProgram();
    const user = userEvent.setup();

    expect(screen.getByText('هنوز برنامه‌ای تعریف نشده است')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /تعریف برنامه جدید از الگوها/ }));

    const pplOption = await screen.findByText(/برنامهٔ ۵ روزه تفکیکی/);
    await user.click(pplOption);

    expect(await screen.findByText(/با موفقیت فعال شد/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /روز ۱: پوش/ })).toBeInTheDocument();
  });

  it('hides manager actions for student accounts with assigned programs', () => {
    setAssignedProgram(originalProgramCopy());
    renderProgram();

    expect(screen.queryByText('نسخهٔ مدیریت برنامه')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /تعریف برنامه جدید/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /حذف برنامه/ })).not.toBeInTheDocument();
    expect(screen.getByText('این برنامه را مربی شما تنظیم کرده است.')).toBeInTheDocument();
  });
});
