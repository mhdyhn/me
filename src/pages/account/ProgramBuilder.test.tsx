import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionProvider } from '../../context/SessionContext';
import { ProgramBuilder } from './ProgramBuilder';
import { CoachEntry } from './CoachHome';

const coachUser = { id: 2, username: 'c100001', role: 'coach', displayName: 'مربی یک', coachId: null, mustChangePassword: false };
const student = { id: 3, username: 's200002', role: 'student', displayName: 'شاگرد الف', coachId: 2, mustChangePassword: false };

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

function mockApi(program: unknown = null, failProgramLoads = 0) {
  const sent: Sent[] = [];
  let remainingProgramLoadFailures = failProgramLoads;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      sent.push({ method, path: input, body });
      let json: unknown = { error: 'nope' };
      let status = 404;
      if (method === 'GET' && input === '/api/me') [json, status] = [{ user: coachUser }, 200];
      if (method === 'GET' && input === '/api/students') [json, status] = [{ students: [student] }, 200];
      if (method === 'GET' && input === '/api/students/3/program') {
        if (remainingProgramLoadFailures > 0) {
          remainingProgramLoadFailures -= 1;
          [json, status] = [{ error: 'temporary network error' }, 503];
        } else {
          [json, status] = [{ program: program ? { id: 'program-1', version: 1, ...(program as object) } : null }, 200];
        }
      }
      if (method === 'POST' && input === '/api/pay/practice') [json, status] = [{ simulation: true, programmeTitle: 'برنامهٔ پولی', amountTomans: 250000, coachShareTomans: 225000, adminShareTomans: 25000 }, 200];
      if (method === 'PUT' && input === '/api/students/3/program') [json, status] = [{ program: { ...(body as object), id: 'program-1', version: 2, updatedAt: 'now' } }, 200];
      if (method === 'DELETE' && input === '/api/students/3/program') [json, status] = [{ ok: true }, 200];
      return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
    }),
  );
  return sent;
}

function renderBuilder() {
  return render(
    <SessionProvider>
      <MemoryRouter initialEntries={['/coach/students/3/program']}>
        <Routes>
          <Route path="/coach" element={<CoachEntry />} />
          <Route path="/coach/students/:studentId/program" element={<ProgramBuilder />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  );
}

beforeEach(() => {
  window.localStorage.setItem('meety.session-token', 'tok-coach-0000000000000001');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('coach programme builder', () => {
  it('retries a failed program load without exposing an empty editable builder', async () => {
    const sent = mockApi(null, 1);
    renderBuilder();

    expect(await screen.findByRole('button', { name: 'تلاش دوباره برای بارگذاری برنامه' })).toBeInTheDocument();
    expect(screen.queryByLabelText('عنوان برنامه')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری برنامه' }));

    expect(await screen.findByLabelText('عنوان برنامه')).toBeInTheDocument();
    expect(sent.filter((call) => call.method === 'GET' && call.path === '/api/students/3/program')).toHaveLength(2);
  });

  it('keeps pricing compact while retaining the editable price and payment split', async () => {
    mockApi({
      title: 'برنامهٔ پولی',
      priceTomans: 250000,
      updatedAt: 'x',
      days: [],
    });
    renderBuilder();
    const user = userEvent.setup();

    await screen.findByLabelText('عنوان برنامه');
    const pricing = screen.getByText('تنظیمات قیمت').closest('details');
    expect(pricing).not.toHaveAttribute('open');
    await user.click(screen.getByText('تنظیمات قیمت'));
    expect(pricing).toHaveAttribute('open');
    expect(screen.getByLabelText('هزینهٔ برنامه (تومان)')).toHaveValue(250000);
    expect(screen.getByText('سهم مربی · ۹۰٪')).toBeInTheDocument();
    expect(screen.getByText('سهم مدیر · ۱۰٪')).toBeInTheDocument();
  });

  it('offers an explicitly read-only payment rehearsal for the saved programme', async () => {
    const sent = mockApi({ title: 'برنامهٔ پولی', priceTomans: 250000, updatedAt: 'x', days: [] });
    renderBuilder();
    const user = userEvent.setup();
    await screen.findByLabelText('عنوان برنامه');
    await user.click(screen.getByText('تنظیمات قیمت'));
    await user.clear(screen.getByLabelText('هزینهٔ برنامه (تومان)'));
    await user.type(screen.getByLabelText('هزینهٔ برنامه (تومان)'), '300000');
    await user.click(screen.getByText('آزمایش پرداخت بدون درگاه'));
    expect(screen.getByText(/تغییرات ذخیره‌نشده در آزمایش لحاظ نمی‌شوند/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'شروع آزمایش پرداخت' }));
    expect(await screen.findByText(/مبلغ برنامه:/)).toHaveTextContent('۲۵۰٬۰۰۰ تومان');
    expect(sent.find((call) => call.path === '/api/pay/practice')?.body).toEqual({ expectedId: 'program-1', expectedVersion: 1, studentId: 3 });
    expect(sent.some((call) => call.path === '/api/pay/start')).toBe(false);
  });

  it('keeps the movement picker closed until asked and shows a short result list', async () => {
    mockApi();
    renderBuilder();
    const user = userEvent.setup();

    await screen.findByLabelText('عنوان برنامه');
    await user.click(screen.getByRole('button', { name: /روز جدید/ }));
    expect(screen.queryByLabelText('جست‌وجوی حرکت با نام فارسی، انگلیسی یا نام حرکت')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /افزودن حرکت/ }));
    expect(screen.getByLabelText('جست‌وجوی حرکت با نام فارسی، انگلیسی یا نام حرکت')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'افزودن' })).toHaveLength(12);
    await user.click(screen.getByRole('button', { name: /نمایش حرکت‌های بیشتر/ }));
    expect(screen.getAllByRole('button', { name: 'افزودن' })).toHaveLength(24);
  });

  it('shows movement prescriptions compactly and opens detailed settings on demand', async () => {
    mockApi({
      title: 'برنامهٔ جمع‌وجور',
      updatedAt: 'x',
      days: [{ name: 'روز اول', exercises: [{ exerciseId: 'a-b', name: 'حرکت نمونه', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    });
    renderBuilder();
    const user = userEvent.setup();

    expect(await screen.findByText('سینه · ۳ ست · 8-12 تکرار · ۹۰ ثانیه استراحت')).toBeInTheDocument();
    const settings = screen.getByText('تنظیمات').closest('details');
    expect(settings).not.toHaveAttribute('open');
    await user.click(screen.getByText('تنظیمات'));
    expect(settings).toHaveAttribute('open');
    expect(screen.getByRole('spinbutton', { name: 'ست' })).toHaveValue(3);
    expect(screen.getByRole('textbox', { name: 'تکرار' })).toHaveValue('8-12');
  });

  it('builds a day from the catalogue and saves it for the student', async () => {
    const sent = mockApi();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('عنوان برنامه'), 'برنامهٔ تست');
    await user.click(screen.getByRole('button', { name: /روز جدید/ }));
    await user.click(screen.getByRole('button', { name: /افزودن حرکت/ }));
    const firstAdd = (await screen.findAllByRole('button', { name: 'افزودن' }))[0];
    await user.click(firstAdd!);
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));

    expect(await screen.findByText(/برنامه ذخیره شد/)).toBeInTheDocument();
    const put = sent.find((call) => call.method === 'PUT');
    expect(put?.path).toBe('/api/students/3/program');
    const body = put!.body as { title: string; days: { name: string; exercises: { sets: number; reps: string; restSeconds: number }[] }[] };
    expect(body.title).toBe('برنامهٔ تست');
    expect(body.days).toHaveLength(1);
    expect(body.days[0]!.exercises).toHaveLength(1);
    expect(body.days[0]!.exercises[0]).toMatchObject({ sets: 3, reps: '8-12', restSeconds: 90 });
  });

  it('refuses to save an invalid rep range and does not call the server', async () => {
    const sent = mockApi({
      title: 'برنامهٔ قبلی',
      updatedAt: 'x',
      days: [{ name: 'روز اول', exercises: [{ exerciseId: 'a-b', name: 'حرکت', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    });
    renderBuilder();
    const user = userEvent.setup();

    await user.click(await screen.findByText('تنظیمات'));
    const repsInput = await screen.findByDisplayValue('8-12');
    await user.clear(repsInput);
    await user.type(repsInput, 'تا خستگی');
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('تکرار');
    expect(sent.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('accepts Persian digits in reps and normalizes them upon saving', async () => {
    const sent = mockApi();
    renderBuilder();
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('عنوان برنامه'), 'برنامه با اعداد فارسی');
    await user.click(screen.getByRole('button', { name: /روز جدید/ }));
    await user.click(screen.getByRole('button', { name: /افزودن حرکت/ }));
    const firstAdd = (await screen.findAllByRole('button', { name: 'افزودن' }))[0];
    await user.click(firstAdd!);
    await user.click(await screen.findByText('تنظیمات'));
    const repsInput = await screen.findByDisplayValue('8-12');
    await user.clear(repsInput);
    await user.type(repsInput, '۸-۱۲');
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await screen.findByText('برنامه ذخیره شد. شاگرد همین حالا وضعیت آن را می‌بیند.');
    const put = sent.find((item) => item.method === 'PUT');
    expect(put?.path).toBe('/api/students/3/program');
    expect((put?.body as { days: Array<{ exercises: Array<{ reps: string }> }> }).days[0]!.exercises[0]!.reps).toBe('8-12');
  });

  it('lets the coach distinguish a free edit from a new paid programme', async () => {
    const sent = mockApi({
      id: 'existing-offer', version: 4, title: 'برنامهٔ موجود', priceTomans: 250000, updatedAt: 'x',
      days: [{ name: 'روز اول', exercises: [{ exerciseId: 'a-b', name: 'حرکت', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderBuilder();
    const user = userEvent.setup();
    const edit = await screen.findByRole('radio', { name: /ویرایش برنامهٔ فعلی/ });
    expect(edit).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /ثبت برنامهٔ جدید/ }));
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await screen.findByText(/برنامه ذخیره شد/);
    const put = sent.find((item) => item.method === 'PUT');
    expect(put?.body).toMatchObject({ saveMode: 'new', expectedId: 'existing-offer', expectedVersion: 4, priceTomans: 250000 });
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it('deleting a day asks for confirmation first', async () => {
    mockApi({ title: 'برنامه', updatedAt: 'x', days: [{ name: 'روز اول', exercises: [] }] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderBuilder();
    const user = userEvent.setup();
    const head = (await screen.findByRole('textbox', { name: 'نام روز' })).parentElement as HTMLElement;
    await user.click(within(head).getByRole('button', { name: /حذف روز/ }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'نام روز' })).toHaveValue('روز اول');
    confirm.mockRestore();
  });
});

describe('ordering in the builder', () => {
  it('renames a day, moves it, and saves the new day order', async () => {
    const sent = mockApi({
      title: 'برنامه',
      updatedAt: 'x',
      days: [
        { name: 'روز اول', exercises: [{ exerciseId: 'day-one-exercise', name: 'اسکوات', muscle: 'پا', sets: 3, reps: '8-12', restSeconds: 90 }] },
        { name: 'روز دوم', exercises: [{ exerciseId: 'day-two-exercise', name: 'پرس', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] },
      ],
    });
    renderBuilder();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('tab', { name: /روز دوم/ }));
    const name = screen.getByRole('textbox', { name: 'نام روز' });
    await user.clear(name);
    await user.type(name, 'پایین‌تنه');
    await user.click(screen.getByRole('button', { name: 'جابه‌جایی روز به بالا' }));
    expect(screen.getByRole('tab', { name: /پایین‌تنه/ })).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await screen.findByText(/برنامه ذخیره شد/);

    const put = sent.find((call) => call.method === 'PUT')!;
    expect((put.body as { days: Array<{ name: string }> }).days.map((day) => day.name)).toEqual(['پایین‌تنه', 'روز اول']);
  });

  it('moves an exercise up and the saved order follows', async () => {
    const sent = mockApi({
      title: 'برنامه',
      updatedAt: 'x',
      days: [
        {
          name: 'روز اول',
          exercises: [
            { exerciseId: 'first-move', name: 'حرکت اول', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 },
            { exerciseId: 'second-move', name: 'حرکت دوم', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 },
          ],
        },
      ],
    });
    renderBuilder();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'بالاتر بردن حرکت دوم' }));
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ برنامه' }));
    await screen.findByText(/برنامه ذخیره شد/);
    const put = sent.find((call) => call.method === 'PUT')!;
    const names = (put.body as { days: { exercises: { name: string }[] }[] }).days[0]!.exercises.map((item) => item.name);
    expect(names).toEqual(['حرکت دوم', 'حرکت اول']);
  });

  it('deletes the student programme after confirmation', async () => {
    const sent = mockApi({
      title: 'برنامه برای حذف',
      updatedAt: 'x',
      days: [{ name: 'روز ۱', exercises: [{ exerciseId: 'first', name: 'حرکت', muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }] }],
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderBuilder();
    const user = userEvent.setup();

    const deleteBtn = await screen.findByRole('button', { name: /برداشتن برنامهٔ فعال/ });
    await user.click(deleteBtn);

    expect(confirm).toHaveBeenCalled();
    expect(await screen.findByText(/برنامهٔ فعال برداشته شد/)).toBeInTheDocument();
    const del = sent.find((call) => call.method === 'DELETE');
    expect(del?.path).toBe('/api/students/3/program');
    confirm.mockRestore();
  });

  it('loads a preset template into the builder', async () => {
    mockApi();
    renderBuilder();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /الگوهای آماده/ }));
    const fullbodyOption = await screen.findByText(/برنامهٔ ۳ روزه فول بادی/);
    await user.click(fullbodyOption);

    expect(await screen.findByDisplayValue(/برنامهٔ ۳ روزه فول بادی/)).toBeInTheDocument();
    expect(await screen.findByText(/الگوی «برنامهٔ ۳ روزه فول بادی/)).toBeInTheDocument();
  });
});
