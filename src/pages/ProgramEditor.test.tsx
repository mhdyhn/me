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

  it('allows adding a custom movement by name', async () => {
    renderEditor('/program/edit?mode=blank');
    const user = userEvent.setup();

    const customInput = screen.getByPlaceholderText(/بارفیکس دست باز مچ برعکس/);
    await user.type(customInput, 'شنا پرشی با دست زدن');

    const addCustomBtn = screen.getByRole('button', { name: /افزودن حرکت سفارشی/ });
    await user.click(addCustomBtn);

    expect(screen.getByDisplayValue('شنا پرشی با دست زدن')).toBeInTheDocument();
  });
});
