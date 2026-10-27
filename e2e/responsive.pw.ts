import { expect, test, type Page } from '@playwright/test';

const long = 'یک‌نام‌خیلی‌بلند‌و‌بدون‌فاصله‌برای‌بررسی‌واکنشگرایی‌در‌نمایش‌موبایل';
const student = { id: 5, username: 'student', displayName: `شاگرد ${long}`, role: 'student', coachId: 4, mustChangePassword: false, isActive: true };
const coach = { id: 4, username: 'coach', displayName: `مربی ${long}`, role: 'coach', coachId: null, mustChangePassword: false, isActive: true };
const admin = { id: 1, username: 'admin', displayName: `مدیر ${long}`, role: 'admin', coachId: null, mustChangePassword: false, isActive: true };
const transactions = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1, studentId: student.id, studentName: student.displayName, coachId: coach.id, coachName: coach.displayName,
  amountTomans: 2_500_000, coachShareTomans: 2_250_000, adminShareTomans: 250_000,
  authority: `transaction-${index}`, status: 'paid', refId: '123456789012345678901234567890', cardPan: null,
  createdAt: '2026-01-01T00:00:00Z', verifiedAt: '2026-01-01T00:00:00Z',
}));
const programme = {
  id: 'program-1',
  version: 1,
  title: `برنامهٔ آزمایشی ${long}`,
  priceTomans: 0,
  updatedAt: '2026-01-01T00:00:00Z',
  days: Array.from({ length: 5 }, (_, index) => ({
    name: `روز ${index + 1}: ${long}`,
    exercises: [{ exerciseId: 'flat-dumbbell-press', name: long, muscle: 'سینه', sets: 3, reps: '8-12', restSeconds: 90 }],
  })),
};

type RecordValue = { kind: string; key: string; version: number; deleted: boolean; value: unknown; updatedAt: string };

async function mockAccount(page: Page, user: typeof student | typeof coach | typeof admin, paid = true, withHistory = false, withArchive = false) {
  const records: RecordValue[] = withHistory ? [{
    kind: 'session', key: 'completed-session', version: 1, deleted: false, updatedAt: '2026-01-01T00:00:00Z',
    value: {
      id: 'completed-session', templateId: 'assigned-day-1', name: long, startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T01:00:00Z', status: 'completed', notes: long, currentExerciseIndex: 0, currentSetIndex: 0,
      exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [{ setNumber: 1, weightKg: 12, reps: 10, rir: 2, notes: long, doneAt: '2026-01-01T00:10:00Z' }] }],
    },
  }, {
    kind: 'bodyweight', key: 'weight-1', version: 1, deleted: false, updatedAt: '2026-01-01T00:00:00Z',
    value: { id: 'weight-1', date: '2026-01-01', weightKg: 65, notes: long },
  }] : [];
  await page.addInitScript((account) => {
    localStorage.setItem('meety.session-token', 'responsive-test');
    localStorage.setItem('meety.session-user', JSON.stringify(account));
    localStorage.setItem('meety.account-scope', `user-${account.id}`);
  }, user);
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let json: unknown = {};
    if (path === '/api/me') json = { user };
    else if (path === '/api/me/programs/archive') json = { programs: withArchive ? [{ ...programme, id: 'previous-program', title: `برنامهٔ قبلی ${long}` }] : [] };
    else if (path === '/api/me/program' || path === '/api/students/5/program') json = { program: { ...programme, priceTomans: paid ? 0 : 2_500_000 }, student, isPaid: paid, coachName: coach.displayName };
    else if (path === '/api/pay/practice') {
      const body = request.postDataJSON() as { sampleAmountTomans?: number };
      const amountTomans = body.sampleAmountTomans ?? 2_500_000;
      const coachShareTomans = Math.floor(amountTomans * 0.9);
      json = { simulation: true, programmeTitle: body.sampleAmountTomans ? 'برنامهٔ نمونه' : programme.title, amountTomans, coachShareTomans, adminShareTomans: amountTomans - coachShareTomans };
    }
    else if (path === '/api/coach/transactions' || path === '/api/admin/transactions') json = { transactions };
    else if (path === '/api/coach/iban') json = { iban: null };
    else if (path === '/api/students/5/ai-settings') json = { biometrics: { limitations: '' } };
    else if (path === '/api/students/5/sessions') json = {
      studentName: student.displayName,
      sessions: [{
        id: 'session-1', name: long, startedAt: '2026-01-01T00:00:00Z', completedAt: null, status: 'active', notes: long,
        exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [] }],
      }],
    };
    else if (path === '/api/me/personal-data') json = { records, nextCursor: null };
    else if (path === '/api/me/personal-data/batch') {
      const { changes } = request.postDataJSON() as { changes: Array<{ kind: string; key: string; baseVersion: number; deleted: boolean; value: unknown }> };
      const results = changes.map((change) => {
        const current = { kind: change.kind, key: change.key, version: change.baseVersion + 1, deleted: change.deleted, value: change.value, updatedAt: new Date().toISOString() };
        const old = records.findIndex((record) => record.kind === change.kind && record.key === change.key);
        if (old >= 0) records.splice(old, 1);
        records.push(current);
        return { kind: change.kind, key: change.key, status: 'saved', current };
      });
      json = { results };
    }
    await route.fulfill({ status: 200, json });
  });
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
    message: 'The document should not scroll horizontally; local tab/table scrollers may.',
  }).toBeLessThanOrEqual(1);
}

async function expectWithinViewport(page: Page, selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

for (const width of [320, 360, 681, 768]) {
  test(`coach's builder and progress keep long names inside the page at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, coach);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/coach/students/5/program', { waitUntil: 'domcontentloaded' });
    const tabs = page.getByRole('tablist').getByRole('tab');
    await expect(tabs).toHaveCount(5);
    await expectNoPageOverflow(page);
    if (width === 320) {
      // Day tabs still scroll independently; the whole page must not scroll sideways.
      expect(await page.getByRole('tablist').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      expect((await page.getByLabel('نام روز').boundingBox())!.height).toBeLessThanOrEqual(64);
    }
    await expect(tabs.first()).toHaveAttribute('title', programme.days[0].name);
    await tabs.last().click();
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
    if (width === 320) {
      await expect.poll(() => page.getByRole('tablist').evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
    }
    await expectNoPageOverflow(page);
    await page.getByRole('button', { name: 'افزودن حرکت' }).click();
    await expect(page.locator('.picker--open')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole('button', { name: 'الگوهای آماده' }).click();
    await expect(page.getByRole('dialog', { name: 'انتخاب الگوی برنامه' })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole('button', { name: 'بستن پنجره' }).click();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    // The app uses smooth scrolling; wait for the animation instead of reading its first frame.
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.goto('/coach/students/5/progress', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.progress-session')).toContainText(long);
    await expectNoPageOverflow(page);
    expect(errors).toEqual([]);
  });

  test(`student programme, active workout and header remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, student);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/program', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.program-day')).toHaveCount(5);
    await expectNoPageOverflow(page);
    await page.locator('.program-day').first().locator('summary').click();
    await expect(page.locator('.program-exercise-details[open]')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByLabel('وزنه به کیلوگرم').fill('12');
    await page.getByRole('button', { name: 'ثبت ست و شروع استراحت' }).click();
    await expect(page.locator('.rest-timer-card')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.goto('/ai-hub', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.resume-pill')).toBeVisible();
    await expectNoPageOverflow(page);
    for (const selector of ['.install-topbar-pill', '.resume-pill', '.account-entry', '.profile-button']) {
      await expectWithinViewport(page, selector);
    }
    const install = page.getByRole('button', { name: 'نصب اپلیکیشن روی گوشی' });
    await expect(install).toBeVisible();
    await install.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByRole('dialog').getByRole('button', { name: 'بستن', exact: true }).first().click();
    expect(errors).toEqual([]);
  });
}

for (const width of [320, 360]) {
  test(`unpaid programme and its payment button fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, student, false);
    await page.goto('/program', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /پرداخت آنلاین و فعال‌سازی/ })).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test(`coach IBAN form fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, coach);
    await page.goto('/coach/transactions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('شماره شبای بانکی')).toBeVisible();
    await expect(page.getByText(/کد پیگیری/)).toHaveCount(8);
    await expectNoPageOverflow(page);
    await expectWithinViewport(page, 'input[aria-label="شماره شبای بانکی"]');
  });
}

for (const width of [320, 1280]) {
  test(`programme sale choices and purchase archive fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, coach);
    await page.goto('/coach/students/5/program', { waitUntil: 'domcontentloaded' });
    const edit = page.getByRole('radio', { name: /ویرایش برنامهٔ فعلی/ });
    const create = page.getByRole('radio', { name: /ثبت برنامهٔ جدید/ });
    await expect(edit).toBeChecked();
    await create.check();
    await expect(create).toBeChecked();
    await expectNoPageOverflow(page);

    await mockAccount(page, student, false, false, true);
    await page.goto('/program', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /پرداخت آنلاین و فعال‌سازی/ })).toBeVisible();
    await page.getByText(/بایگانی برنامه‌های قبلی/).click();
    await page.getByText(`برنامهٔ قبلی ${long}`).click();
    await expect(page.locator('.programme-archive__item li')).toHaveCount(5);
    await expectNoPageOverflow(page);
  });
}

test('admin transaction cards wrap long names and reference codes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, admin);
  await page.goto('/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/کد پیگیری/)).toHaveCount(8);
  await expectNoPageOverflow(page);
});

test('a populated progress table scrolls locally without moving the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, student, true, true);
  await page.goto('/progress', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.history-table tbody tr')).toHaveCount(1);
  const table = page.locator('.history-table-wrap');
  expect(await table.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await table.evaluate((el) => { el.scrollLeft = -el.scrollWidth; });
  await expect.poll(() => table.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
  await expectNoPageOverflow(page);
  await page.locator('.session-history-row').click();
  await expect(page.locator('.session-history-detail')).toBeVisible();
  await expectNoPageOverflow(page);
});

for (const width of [320, 390]) {
  for (const role of ['coach', 'student'] as const) {
    test(`read-only payment practice fits and stays labelled for ${role} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAccount(page, role === 'coach' ? coach : student, false);
      const errors: string[] = [];
      const requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => { if (request.url().includes('/api/pay/')) requests.push(new URL(request.url()).pathname); });
      await page.goto(role === 'coach' ? '/coach/students/5/program' : '/program', { waitUntil: 'domcontentloaded' });
      await page.getByText('آزمایش پرداخت بدون درگاه').click();
      await expect(page.getByText(/تراکنشی ثبت نمی‌کند و برنامه را باز نمی‌کند/)).toBeVisible();
      await page.getByRole('button', { name: 'شروع آزمایش پرداخت' }).click();
      await expect(page.getByText(/پیش‌نمایش آزمایشی:/)).toBeVisible();
      await expectNoPageOverflow(page);
      if (role === 'coach') await expect(page.getByText(/سهم محاسبه‌شدهٔ مربی/)).toBeVisible();
      else await expect(page.getByText(/سهم محاسبه‌شدهٔ مربی/)).toHaveCount(0);
      await page.getByRole('button', { name: 'فرض پرداخت موفق' }).click();
      await expect(page.getByRole('status')).toContainText('هیچ پول، تراکنش یا دسترسی واقعی ایجاد نشده است');
      if (role === 'student') await expect(page.getByRole('button', { name: /پرداخت آنلاین و فعال‌سازی/ })).toBeVisible();
      await expectNoPageOverflow(page);
      expect(requests).toEqual(['/api/pay/practice']);
      expect(errors).toEqual([]);
    });
  }
}

for (const role of ['coach', 'admin'] as const) {
  test(`${role} can practise a sample amount without selecting a student at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await mockAccount(page, role === 'coach' ? coach : admin);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(role === 'coach' ? '/coach/transactions' : '/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
    await page.getByText('آزمایش پرداخت بدون درگاه').click();
    await page.getByLabel('مبلغ نمونه (تومان)').fill('123456');
    await page.getByRole('button', { name: 'شروع آزمایش پرداخت' }).click();
    await expect(page.getByText('پیش‌نمایش آزمایشی: برنامهٔ نمونه')).toBeVisible();
    await expect(page.getByText(/سهم محاسبه‌شدهٔ مربی: ۱۱۱٬۱۱۰/)).toBeVisible();
    await page.getByRole('button', { name: 'فرض انصراف' }).click();
    await expect(page.getByRole('status')).toContainText('انصراف فرض شد');
    await expectNoPageOverflow(page);
    expect(errors).toEqual([]);
  });
}
