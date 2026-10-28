import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ api: vi.fn(), confirm: vi.fn() }));
vi.mock('../../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../../components/ConfirmModal', () => ({ confirmModal: mocks.confirm }));
import { AdminStudents } from './AdminStudents';

const student = { id: 8, username: 'sara.fit', role: 'student', displayName: 'سارا', coachId: null, selfRegistered: true, isActive: true, mustChangePassword: false };
beforeEach(() => { mocks.api.mockReset(); mocks.confirm.mockReset(); });
afterEach(cleanup);

describe('admin support for independent students', () => {
  it('loads the list on opening, searches by exact username, and requires an identity-check confirmation for reset', async () => {
    mocks.api.mockResolvedValueOnce({ students: [student] }).mockResolvedValueOnce({ students: [student] }).mockResolvedValueOnce({ username: 'sara.fit', password: 'new-password' });
    mocks.confirm.mockResolvedValue(true);
    render(<MemoryRouter><AdminStudents /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'همهٔ شاگردها' })).toBeInTheDocument();
    expect(await screen.findByText('سارا')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('نام کاربری دقیق'), { target: { value: 'sara.fit' } });
    fireEvent.click(screen.getByRole('button', { name: /جست‌وجو/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('GET', '/admin/students?username=sara.fit'));
    fireEvent.click(screen.getByRole('button', { name: /رمز تازه/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/students/8/reset-password', {}));
    expect(mocks.confirm.mock.calls[0]![0].message).toContain('بررسی هویت');
    expect(await screen.findByText('new-password')).toBeInTheDocument();
  });

  it('loads the next page without losing existing student cards', async () => {
    mocks.api.mockResolvedValueOnce({ students: [student], nextCursor: 8 }).mockResolvedValueOnce({ students: [{ ...student, id: 7, username: 'other.fit', displayName: 'شاگرد دستی', selfRegistered: false, coachName: 'مربی' }], nextCursor: null });
    render(<MemoryRouter><AdminStudents /></MemoryRouter>);
    expect(await screen.findByText('سارا')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'نمایش شاگردهای بیشتر' }));
    expect(await screen.findByText('شاگرد دستی')).toBeInTheDocument();
    expect(screen.getByText('سارا')).toBeInTheDocument();
    expect(mocks.api).toHaveBeenCalledWith('GET', '/admin/students?before=8');
    expect(screen.queryByRole('button', { name: 'نمایش شاگردهای بیشتر' })).not.toBeInTheDocument();
  });
});
