import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { GymProvider } from '../context/GymProvider';
import { SessionProvider } from '../context/SessionContext';
import { setActiveProgram, originalProgramCopy } from '../lib/programStore';
import { ProgramEditor } from './ProgramEditor';

function renderEditor(initialEntry = '/program/edit') {
  return render(
    <GymProvider>
      <SessionProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/program/edit" element={<ProgramEditor />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>
    </GymProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  setActiveProgram(originalProgramCopy());
});

describe('program editor with categorized movement picker', () => {
  it('opens in blank mode and displays categorized muscle groups', () => {
    renderEditor('/program/edit?mode=blank');

    expect(screen.getByText('برنامهٔ جدید از صفر فعال شد. دسته‌بندی عضلانی مورد نظر را انتخاب و حرکت‌ها را اضافه کنید.')).toBeInTheDocument();
    expect(screen.getByText('انتخاب حرکت از دسته‌بندی‌ها')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'سینه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پشت و زیربغل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'سرشانه' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'پا' })).toBeInTheDocument();
  });

  it('filters exercises by category and search query and adds to the day', async () => {
    renderEditor('/program/edit?mode=blank');
    const user = userEvent.setup();

    // Click on "سینه" category
    await user.click(screen.getByRole('button', { name: 'سینه' }));
    expect(screen.getByText('پرس سینه با هالتر')).toBeInTheDocument();

    // Search for bench press
    const searchInput = screen.getByPlaceholderText(/جست‌وجوی حرکت با نام فارسی، انگلیسی/);
    await user.type(searchInput, 'هالتر');

    // Add movement
    const addButtons = screen.getAllByRole('button', { name: /افزودن به این روز/ });
    await user.click(addButtons[0]!);

    // Should appear in day's exercises list
    expect(screen.getByDisplayValue('پرس سینه با هالتر')).toBeInTheDocument();
  });

  it('starts with 0 exercises in blank mode and does not pre-populate any movements', () => {
    renderEditor('/program/edit?mode=blank');

    // Must show empty day note and no pre-populated exercises
    expect(screen.getByText(/این روز هنوز حرکتی ندارد/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue('پرس سینه با هالتر')).not.toBeInTheDocument();
  });

  it('finds "زیر بغل سیم‌کش دست خنثی" when searching for "دست خنثی" or "زیر بغل سیم‌کش دست خنثی"', async () => {
    renderEditor('/program/edit?mode=blank');
    const user = userEvent.setup();

    const searchInput = screen.getByPlaceholderText(/جست‌وجوی حرکت با نام فارسی، انگلیسی/);
    await user.type(searchInput, 'دست خنثی');

    // Should find the movement and allow adding it
    expect(screen.getByText('زیر بغل سیم‌کش دست خنثی (دستگیرهٔ موازی)')).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /افزودن به این روز/ });
    await user.click(addBtn);

    expect(screen.getByDisplayValue('زیر بغل سیم‌کش دست خنثی (دستگیرهٔ موازی)')).toBeInTheDocument();
  });

  it('finds "زیر بغل سیم‌کش تک‌دست" when searching for "لت تک دست" or "Single-Arm Lat Pulldown"', async () => {
    renderEditor('/program/edit?mode=blank');
    const user = userEvent.setup();

    const searchInput = screen.getByPlaceholderText(/جست‌وجوی حرکت با نام فارسی، انگلیسی/);
    await user.type(searchInput, 'لت تک دست');

    expect(screen.getByText('زیر بغل سیم‌کش تک‌دست')).toBeInTheDocument();
    expect(screen.getByText('Single-Arm Lat Pulldown')).toBeInTheDocument();

    const addBtn = screen.getByRole('button', { name: /افزودن به این روز/ });
    await user.click(addBtn);

    expect(screen.getByDisplayValue('زیر بغل سیم‌کش تک‌دست')).toBeInTheDocument();
  });
});
