import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../../context/SessionContext';
import { ChangePassword } from './ChangePassword';
import { CoachEntry } from './CoachHome';
import { Login } from './Login';

type Handler = (method: string, path: string, body: unknown) => { status: number; json: unknown };

function mockApi(handler: Handler) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const result = handler(method, input, body);
    return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderAt(path: string) {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/account/change-password" element={<ChangePassword />} />
          <Route path="/coach" element={<CoachEntry />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

const coachUser = { id: 2, username: 'c100001', role: 'coach', displayName: 'مربی یک', coachId: null, mustChangePassword: false };
const studentUser = { id: 3, username: 's200002', role: 'student', displayName: 'شاگرد الف', coachId: 2, mustChangePassword: false };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sign-in and role routing', () => {
  it('a coach signs in and lands on the student list', async () => {
    let signedIn = false;
    mockApi((method, path) => {
      if (method === 'POST' && path === '/api/auth/login') {
        signedIn = true;
        return { status: 200, json: { token: 'tok-coach-0000000000000001', user: coachUser } };
      }
      if (method === 'GET' && path === '/api/me') return signedIn ? { status: 200, json: { user: coachUser } } : { status: 401, json: { error: 'ابتدا وارد شوید.' } };
      if (method === 'GET' && path === '/api/students') return { status: 200, json: { students: [] } };
      return { status: 404, json: { error: 'nope' } };
    });
    renderAt('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('نام کاربری'), 'c100001');
    await user.type(screen.getByLabelText('رمز عبور'), 'secret-pass-1');
    await user.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('heading', { name: 'شاگردهای من' })).toBeInTheDocument();
    expect(window.localStorage.getItem('meety.session-token')).toBe('tok-coach-0000000000000001');
  });

  it('a student with a temporary password is sent to change it first', async () => {
    let signedIn = false;
    mockApi((method, path) => {
      if (method === 'POST' && path === '/api/auth/login') {
        signedIn = true;
        return { status: 200, json: { token: 'tok-student-00000000000001', user: { ...studentUser, mustChangePassword: true } } };
      }
      if (method === 'GET' && path === '/api/me') return signedIn ? { status: 200, json: { user: { ...studentUser, mustChangePassword: true } } } : { status: 401, json: { error: 'ابتدا وارد شوید.' } };
      return { status: 404, json: { error: 'nope' } };
    });
    renderAt('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('نام کاربری'), 's200002');
    await user.type(screen.getByLabelText('رمز عبور'), 'temp-pass-12');
    await user.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('heading', { name: 'رمز تازهٔ خود را انتخاب کنید' })).toBeInTheDocument();
  });

  it('does not enter the app when the session does not reach the server after sign-in', async () => {
    mockApi((method, path) => {
      if (method === 'POST' && path === '/api/auth/login') return { status: 200, json: { token: 'tok-lost-000000000000000001', user: coachUser } };
      return { status: 401, json: { error: 'ابتدا وارد شوید.' } };
    });
    renderAt('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('نام کاربری'), 'c100001');
    await user.type(screen.getByLabelText('رمز عبور'), 'secret-pass-1');
    await user.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('مرورگر نشست را نگه نداشت');
    expect(window.localStorage.getItem('meety.session-token')).toBeNull();
  });

  it('shows the server message for a wrong password', async () => {
    mockApi(() => ({ status: 401, json: { error: 'نام کاربری یا رمز عبور اشتباه است.' } }));
    renderAt('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('نام کاربری'), 'x');
    await user.type(screen.getByLabelText('رمز عبور'), 'y');
    await user.click(screen.getByRole('button', { name: 'ورود' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربری یا رمز عبور اشتباه است.');
  });
});

describe('coach screen', () => {
  it('creates a student and shows the username and password once', async () => {
    window.localStorage.setItem('meety.session-token', 'tok-coach-0000000000000001');
    let studentCreated = false;
    mockApi((method, path) => {
      if (method === 'GET' && path === '/api/me') return { status: 200, json: { user: coachUser } };
      if (method === 'GET' && path === '/api/students') {
        return { status: 200, json: { students: studentCreated ? [{ ...studentUser, mustChangePassword: true }] : [] } };
      }
      if (method === 'POST' && path === '/api/students') {
        studentCreated = true;
        return { status: 201, json: { user: { ...studentUser, mustChangePassword: true }, username: 's200002', password: 'abcd2345xy' } };
      }
      return { status: 404, json: { error: 'nope' } };
    });
    renderAt('/coach');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('نام شاگرد جدید'), 'شاگرد الف');
    await user.type(screen.getByLabelText('شماره موبایل شاگرد'), '09123456789');
    await user.click(screen.getByRole('button', { name: /ساخت شاگرد/ }));

    const warning = await screen.findByText(/این مشخصات فقط همین یک بار نمایش داده می‌شود/);
    const card = warning.closest('section')!;
    expect(card).toHaveTextContent('abcd2345xy');
    expect(card).toHaveTextContent('s200002');

    await user.click(within(card).getByRole('button', { name: 'متوجه شدم' }));
    expect(await screen.findByText('رمز موقت')).toBeInTheDocument();
  });
});

