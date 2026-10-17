import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CoachHome } from '../src/pages/account/CoachHome';
import { AdminHome } from '../src/pages/account/AdminHome';
import { Login } from '../src/pages/account/Login';
import { RequireSignIn } from '../src/pages/account/AccountShell';
import * as SessionContextModule from '../src/context/SessionContext';
import * as apiModule from '../src/lib/api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('Coach and Admin Activation UI', () => {
  it('Coach panel shows student status badge and toggles student active state', async () => {
    const mockStudent = {
      id: 101,
      username: 's101',
      displayName: 'شاگرد آزمایشی',
      role: 'student' as const,
      coachId: 1,
      mustChangePassword: false,
      isActive: true,
      password: null,
    };

    const apiSpy = vi.spyOn(apiModule, 'api').mockImplementation(async (method, path, body) => {
      if (path === '/students' && method === 'GET') {
        return { students: [mockStudent] } as any;
      }
      if (path === '/students/101/active' && method === 'PUT') {
        mockStudent.isActive = (body as any).active;
        return { ok: true, isActive: (body as any).active } as any;
      }
      return {} as any;
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.spyOn(SessionContextModule, 'useSession').mockReturnValue({
      status: 'signed-in',
      user: {
        id: 1,
        username: 'c1',
        displayName: 'مربی نمونه',
        role: 'coach',
        coachId: null,
        mustChangePassword: false,
        isActive: true,
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <CoachHome />
      </MemoryRouter>
    );

    expect(await screen.findByText('شاگرد آزمایشی')).toBeInTheDocument();
    expect(screen.getByText('فعال')).toBeInTheDocument();

    const deactBtn = screen.getByRole('button', { name: /غیرفعال‌سازی/i });
    fireEvent.click(deactBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith('PUT', '/students/101/active', { active: false });
    });
  });

  it('Admin panel displays coach status and expandable students section with active toggle', async () => {
    const mockCoach = {
      id: 5,
      username: 'c5',
      displayName: 'مربی علی',
      role: 'coach' as const,
      coachId: null,
      mustChangePassword: false,
      isActive: true,
      studentCount: 1,
      password: null,
    };

    const mockStudent = {
      id: 202,
      username: 's202',
      displayName: 'شاگرد علی رضا',
      role: 'student' as const,
      coachId: 5,
      mustChangePassword: false,
      isActive: true,
      password: null,
    };

    const apiSpy = vi.spyOn(apiModule, 'api').mockImplementation(async (method, path, body) => {
      if (path === '/coaches' && method === 'GET') {
        return { coaches: [mockCoach] } as any;
      }
      if (path === '/coaches/5/active' && method === 'PUT') {
        mockCoach.isActive = (body as any).active;
        return { ok: true, isActive: (body as any).active } as any;
      }
      if (path === '/admin/coaches/5/students' && method === 'GET') {
        return { coachName: 'مربی علی', students: [mockStudent] } as any;
      }
      if (path === '/students/202/active' && method === 'PUT') {
        mockStudent.isActive = (body as any).active;
        return { ok: true, isActive: (body as any).active } as any;
      }
      return {} as any;
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    vi.spyOn(SessionContextModule, 'useSession').mockReturnValue({
      status: 'signed-in',
      user: {
        id: 99,
        username: 'admin',
        displayName: 'مدیر کل',
        role: 'admin',
        coachId: null,
        mustChangePassword: false,
        isActive: true,
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <AdminHome />
      </MemoryRouter>
    );

    expect(await screen.findByText('مربی علی')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /غیرفعال‌سازی مربی/i })).toBeInTheDocument();

    // Expand students section
    const showStudentsBtn = screen.getByRole('button', { name: /مشاهده شاگردان/i });
    fireEvent.click(showStudentsBtn);

    // Verify student is displayed inside coach card
    expect(await screen.findByText('شاگرد علی رضا')).toBeInTheDocument();
    expect(screen.getByText('@s202')).toBeInTheDocument();

    // Deactivate student from admin panel
    const deactStudentBtn = screen.getByRole('button', { name: /^غیرفعال‌سازی$/ });
    fireEvent.click(deactStudentBtn);

    await waitFor(() => {
      expect(apiSpy).toHaveBeenCalledWith('PUT', '/students/202/active', { active: false });
    });
  });

  it('Login screen displays deactivated error message when redirected', async () => {
    window.sessionStorage.setItem('meety:deactivated-message', 'حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.');

    vi.spyOn(SessionContextModule, 'useSession').mockReturnValue({
      status: 'signed-out',
      user: null,
      signIn: vi.fn().mockRejectedValue(new apiModule.ApiError(403, 'حساب کاربری شما غیرفعال شده است. لطفاً با مربی یا پشتیبانی تماس بگیرید.')),
      signOut: vi.fn(),
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('حساب کاربری شما غیرفعال شده است');
  });

  it('RequireSignIn displays deactivated card if active user becomes deactivated', () => {
    vi.spyOn(SessionContextModule, 'useSession').mockReturnValue({
      status: 'signed-in',
      user: {
        id: 10,
        username: 'inactive_user',
        displayName: 'کاربر غیرفعال',
        role: 'student',
        coachId: 1,
        mustChangePassword: false,
        isActive: false,
      },
      signIn: vi.fn(),
      signOut: vi.fn(),
      refresh: vi.fn(),
      setUser: vi.fn(),
    });

    render(
      <MemoryRouter>
        <RequireSignIn>
          <div>محتوای برنامه</div>
        </RequireSignIn>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('حساب کاربری شما غیرفعال شده است');
    expect(screen.queryByText('محتوای برنامه')).not.toBeInTheDocument();
  });
});
