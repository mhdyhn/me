import { expect, test, type Page } from '@playwright/test';

const long = 'یک‌نام‌خیلی‌بلند‌و‌بدون‌فاصله‌برای‌بررسی‌واکنشگرایی‌در‌نمایش‌موبایل';
const student = { id: 5, username: 'student', displayName: `شاگرد ${long}`, role: 'student', coachId: 4, mustChangePassword: false, isActive: true };
const coach = { id: 4, username: 'coach', displayName: `مربی ${long}`, role: 'coach', coachId: null, mustChangePassword: false, isActive: true };
const admin = { id: 1, username: 'admin', displayName: `مدیر ${long}`, role: 'admin', coachId: null, mustChangePassword: false, isActive: true };
const independent = { ...student, coachId: null, selfRegistered: true, coachAccess: true };
const transactions = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1, studentId: student.id, studentName: student.displayName, coachId: coach.id, coachName: coach.displayName,
  amountTomans: 2_500_000, coachShareTomans: 2_250_000, adminShareTomans: 250_000,
  authority: `transaction-${index}`, status: 'paid', refId: '123456789012345678901234567890', cardPan: null,
  createdAt: '2026-01-01T00:00:00Z', verifiedAt: '2026-01-01T00:00:00Z',
}));
const testTransactions = [
  { ...transactions[0], id: 41, authority: 'TEST-first', simulation: true, programmeId: 'program-1', programmeVersion: 1, refId: null },
  { ...transactions[1], id: 42, authority: 'TEST-canceled', simulation: true, programmeId: 'program-1', programmeVersion: 1, status: 'canceled', refId: null },
  { ...transactions[2], id: 43, authority: 'TEST-pending', simulation: true, programmeId: 'program-1', programmeVersion: 1, status: 'pending', refId: null },
  { ...transactions[3], id: 44, authority: 'TEST-expired', simulation: true, programmeId: 'program-1', programmeVersion: 1, status: 'expired', refId: null },
];
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

async function mockAccount(page: Page, user: typeof student | typeof independent | typeof coach | typeof admin, paid = true, withHistory = false, withArchive = false, testAvailable = true) {
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
  let activeProgramme = programme;
  let testPurchased = false;
  let testEnabled = false;
  let globalTestEnabled = false;
  let syncOffline = false;
  let syncFailure: 'http' | 'malformed' | null = null;
  let syncWait: Promise<void> | null = null;
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
    else if (path === '/api/me/program' || path === '/api/students/5/program') json = { program: { ...activeProgramme, priceTomans: paid ? 0 : 2_500_000 }, student, isPaid: paid, isTestPurchase: testPurchased, testPurchaseAvailable: testAvailable && !paid && !testPurchased, testPurchaseExpiresAt: new Date(Date.now() + 86_400_000).toISOString(), coachName: coach.displayName };
    else if (path === '/api/students/5/programs/archive') json = { programs: withArchive ? [{ ...programme, id: 'previous-program', title: `برنامهٔ قبلی ${long}` }] : [], nextCursor: null };
    else if (path === '/api/students/5/programs/restore') { activeProgramme = { ...programme, id: 'previous-program', title: `برنامهٔ قبلی ${long}`, version: 2147483648 }; json = { program: activeProgramme }; }
    else if (path === '/api/me/nutrition/archive') json = { plans: [], nextCursor: null };
    else if (path === '/api/me/ai-settings/archive') json = { records: [], nextCursor: null };
    else if (path === '/api/me/chat/archive') json = { threads: [], nextCursor: null };
    else if (path === '/api/students/5/test-purchase') {
      if (request.method() === 'PUT') testEnabled = (request.postDataJSON() as { enabled: boolean }).enabled;
      json = { available: true, enabled: testEnabled, purchased: false, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    }
    else if (path === '/api/pay/test/start') json = { simulation: true, authority: 'TEST-01234567-89ab-cdef-0123-456789abcdef', amountTomans: 2_500_000, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    else if (path === '/api/pay/test/confirm') {
      testPurchased = (request.postDataJSON() as { result: string }).result === 'success';
      json = { simulation: true, success: testPurchased, amountTomans: 2_500_000, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    }
    else if (path === '/api/pay/practice') {
      const body = request.postDataJSON() as { sampleAmountTomans?: number };
      const amountTomans = body.sampleAmountTomans ?? 2_500_000;
      const coachShareTomans = Math.floor(amountTomans * 0.9);
      json = { simulation: true, programmeTitle: body.sampleAmountTomans ? 'برنامهٔ نمونه' : programme.title, amountTomans, coachShareTomans, adminShareTomans: amountTomans - coachShareTomans };
    }
    else if (path === '/api/coach/transactions' || path === '/api/admin/transactions') json = { transactions, testTransactions };
    else if (path === '/api/admin/payment-test-mode') {
      if (request.method() === 'PUT') globalTestEnabled = (request.postDataJSON() as { enabled: boolean }).enabled;
      json = { available: true, enabled: globalTestEnabled, expiresAt: globalTestEnabled ? new Date(Date.now() + 86_400_000).toISOString() : null };
    }
    else if (path === '/api/coach/iban') json = { iban: null };
    else if (path === '/api/students/5/ai-settings') json = { biometrics: { limitations: '' } };
    else if (path === '/api/students/5/sessions') json = {
      studentName: student.displayName,
      sessions: [{
        id: 'session-1', name: long, startedAt: '2026-01-01T00:00:00Z', completedAt: null, status: 'active', notes: long,
        exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [] }],
      }],
    };
    else if (path === '/api/me/personal-data') {
      if (syncOffline) { await route.abort('failed'); return; }
      if (syncFailure === 'http') { await route.fulfill({ status: 503, json: { error: 'داده در دسترس نیست.' } }); return; }
      if (syncFailure === 'malformed') { await route.fulfill({ status: 200, json: {} }); return; }
      if (syncWait) await syncWait;
      json = { records, nextCursor: null };
    }
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
  return {
    setProgramme: (next: typeof programme) => { activeProgramme = next; },
    setSyncOffline: (offline: boolean) => { syncOffline = offline; },
    setSyncFailure: (failure: 'http' | 'malformed' | null) => { syncFailure = failure; },
    pauseSync: () => {
      let release = () => {};
      syncWait = new Promise<void>((resolve) => { release = resolve; });
      return () => { release(); syncWait = null; };
    },
    records,
  };
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
    await mockAccount(page, student, false, false, false, false);
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

    await mockAccount(page, student, false, false, true, false);
    await page.goto('/program', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /پرداخت آنلاین و فعال‌سازی/ })).toBeVisible();
    await page.getByText(/بایگانی برنامه‌های قبلی/).click();
    await page.getByText(`برنامهٔ قبلی ${long}`).click();
    await expect(page.locator('.programme-archive__item li')).toHaveCount(5);
    await expectNoPageOverflow(page);
  });
}

test('a synced workout keeps its original template when another device removes the assigned programme', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const mock = await mockAccount(page, student);
  await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  await page.getByLabel('وزنه به کیلوگرم').fill('12');
  await page.getByRole('button', { name: 'ثبت ست و شروع استراحت' }).click();
  await expect.poll(() => mock.records.some((record) => record.kind === 'session' && !!(record.value as { templateSnapshot?: unknown }).templateSnapshot)).toBe(true);
  mock.setProgramme({ ...programme, days: [] });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  await expect(page.getByText(long).first()).toBeVisible();
  await expectNoPageOverflow(page);
});

test('a temporary test purchase does not save a permanent prescription in the workout snapshot', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const mock = await mockAccount(page, student, false);
  await page.goto('/program', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /خرید و فعال‌سازی آزمایشی/ }).click();
  await page.getByRole('dialog', { name: 'تأیید خرید آزمایشی' }).getByRole('button', { name: 'تأیید و فعال‌سازی آزمایشی' }).click();
  await expect(page.getByText(/دسترسی این برنامه آزمایشی است/)).toBeVisible();
  await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  await expect.poll(() => mock.records.some((record) => record.kind === 'session')).toBe(true);
  const session = mock.records.find((record) => record.kind === 'session')!.value as { templateSnapshot?: unknown; templateReference?: unknown };
  expect(session.templateSnapshot).toBeUndefined();
  expect(session.templateReference).toEqual({ programmeId: programme.id, version: programme.version });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  // Even if the day and exercise names match, an edited prescription is not the same version.
  mock.setProgramme({ ...programme, version: 2, days: programme.days.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => ({ ...exercise, sets: 5 })) })) });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('برنامهٔ اصلی این جلسه در دسترس نیست')).toBeVisible();
  await expect(page.getByLabel('وزنه به کیلوگرم')).toHaveCount(0);
});

for (const failure of ['http', 'malformed', 'partial'] as const) {
  test(`initial ${failure} sync failure blocks creating a workout until a successful retry`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const mock = await mockAccount(page, student);
    if (failure === 'partial') mock.records.push({ kind: 'program', key: 'main', version: 1, deleted: false, value: { invalid: true }, updatedAt: '2026-01-01T00:00:00Z' });
    else mock.setSyncFailure(failure);
    await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('بررسی تمرین‌های سرور انجام نشد')).toBeVisible();
    await expect(page.getByLabel('وزنه به کیلوگرم')).toHaveCount(0);
    const localSessionCount = await page.evaluate(() => new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('meety-personal-user-5');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const request = open.result.transaction('sessions', 'readonly').objectStore('sessions').count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { resolve(request.result); open.result.close(); };
      };
    }));
    expect(localSessionCount).toBe(0);
    expect(mock.records.filter((record) => record.kind === 'session')).toHaveLength(0);
    if (failure === 'partial') mock.records.splice(0, mock.records.length);
    else mock.setSyncFailure(null);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
    await expect.poll(() => mock.records.filter((record) => record.kind === 'session')).toHaveLength(1);
    await expectNoPageOverflow(page);
  });
}

test('a delayed legacy session is not replaced or guessed and can close with its sets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const mock = await mockAccount(page, student);
  const release = mock.pauseSync();
  const loggedSet = { setNumber: 1, weightKg: 17, reps: 9, rir: 2, doneAt: '2026-01-01T00:10:00Z' };
  mock.records.push({ kind: 'session', key: 'legacy-active', version: 1, deleted: false, updatedAt: '2026-01-01T00:00:00Z', value: {
    id: 'legacy-active', templateId: 'assigned-day-1', name: programme.days[0]!.name, startedAt: '2026-01-01T00:00:00Z',
    status: 'active', notes: 'ست قدیمی', currentExerciseIndex: 0, currentSetIndex: 0,
    exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [loggedSet] }],
  } });
  await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('در حال بررسی تمرین‌های دستگاه‌های دیگر…')).toBeVisible();
  await expect(page.getByLabel('وزنه به کیلوگرم')).toHaveCount(0);
  release();
  await expect(page.getByText('برنامهٔ اصلی این جلسه در دسترس نیست')).toBeVisible();
  await expect(page.getByLabel('وزنه به کیلوگرم')).toHaveCount(0);
  await page.getByRole('button', { name: 'ثبت و بستن جلسه با ست‌های موجود' }).click();
  await page.getByRole('dialog', { name: 'بستن جلسه با ست‌های ثبت‌شده' }).getByRole('button', { name: 'ثبت و بستن جلسه' }).click();
  await expect.poll(() => (mock.records.find((record) => record.key === 'legacy-active')?.value as { status?: string })?.status).toBe('completed');
  const saved = mock.records.find((record) => record.key === 'legacy-active')!.value as { exercises: Array<{ sets: unknown[] }> };
  expect(saved.exercises[0]!.sets).toEqual([loggedSet]);
  expect(mock.records.filter((record) => record.kind === 'session')).toHaveLength(1);
  await expectNoPageOverflow(page);
});

test('a late sync surfaces two active sessions and closes either without losing sets', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const mock = await mockAccount(page, student);
  mock.setSyncOffline(true);
  await page.goto('/workout/assigned-day-1', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  await page.getByLabel('وزنه به کیلوگرم').fill('12');
  await page.getByRole('button', { name: 'ثبت ست و شروع استراحت' }).click();
  const remoteSet = { setNumber: 1, weightKg: 20, reps: 8, rir: 2, doneAt: '2026-01-01T00:10:00Z' };
  mock.records.push({ kind: 'session', key: 'other-device', version: 1, deleted: false, updatedAt: '2026-01-01T00:00:00Z', value: {
    id: 'other-device', templateId: 'old-day', name: 'تمرین دستگاه دیگر', startedAt: '2026-01-01T00:00:00Z',
    status: 'active', notes: '', currentExerciseIndex: 0, currentSetIndex: 0,
    exercises: [{ exerciseId: 'flat-dumbbell-press', sets: [remoteSet] }],
  } });
  mock.setSyncOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('چند جلسهٔ فعال پیدا شد')).toBeVisible();
  const other = page.locator('section.panel-card').filter({ hasText: 'تمرین دستگاه دیگر' });
  await other.getByRole('button', { name: 'ثبت و بستن این جلسه' }).click();
  await page.getByRole('dialog', { name: 'بستن این جلسه' }).getByRole('button', { name: 'ثبت و بستن جلسه' }).click();
  await expect.poll(() => (mock.records.find((record) => record.key === 'other-device')?.value as { status?: string })?.status).toBe('completed');
  const remote = mock.records.find((record) => record.key === 'other-device')!.value as { exercises: Array<{ sets: unknown[] }> };
  expect(remote.exercises[0]!.sets).toEqual([remoteSet]);
  await expect(page.getByLabel('وزنه به کیلوگرم')).toBeVisible();
  await expectNoPageOverflow(page);
});

test('history keeps the original exercise name and chart after the programme changes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const mock = await mockAccount(page, student);
  mock.setProgramme({ ...programme, days: [] });
  const snapshot = { id: 'old-day', name: 'روز قدیمی', focus: '', dayLabel: 'اول', durationMinutes: 40, description: '', exercises: [
    { exerciseId: 'custom-old-exercise', name: 'نام اصلی حرکت قدیمی', prescription: { sets: 3, minReps: 8, maxReps: 12, minimumRir: 0, targetRirLabel: '۲', restSeconds: 60, note: '' } },
  ] };
  mock.records.push({ kind: 'session', key: 'old-completed', version: 1, deleted: false, updatedAt: '2026-01-01T01:00:00Z', value: {
    id: 'old-completed', templateId: 'old-day', templateSnapshot: snapshot, name: 'روز قدیمی', startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T01:00:00Z',
    status: 'completed', notes: '', currentExerciseIndex: 0, currentSetIndex: 0,
    exercises: [{ exerciseId: 'custom-old-exercise', sets: [{ setNumber: 1, weightKg: 20, reps: 8, rir: 2, doneAt: '2026-01-01T00:10:00Z' }] }],
  } });
  await page.goto('/progress', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('انتخاب حرکت').locator('option', { hasText: 'نام اصلی حرکت قدیمی' })).toHaveCount(1);
  await page.locator('.session-history-row').filter({ hasText: 'روز قدیمی' }).click();
  await expect(page.locator('.session-history-detail')).toContainText('نام اصلی حرکت قدیمی');
  await expect(page.locator('.session-history-detail')).toContainText('۲۰');
  await expectNoPageOverflow(page);
});

test('coach can explicitly reactivate an earlier offer on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, coach, true, false, true);
  await page.goto('/coach/students/5/program', { waitUntil: 'domcontentloaded' });
  await page.getByText('برنامه‌های قبلی این شاگرد').click();
  await expect(page.getByText(`برنامهٔ قبلی ${long}`)).toBeVisible();
  await page.getByRole('button', { name: 'فعال‌کردن این برنامه' }).click();
  const dialog = page.getByRole('dialog', { name: 'فعال‌کردن برنامهٔ قبلی' });
  await expect(dialog).toContainText('خرید قبلی همین برنامه حفظ خواهد شد');
  await dialog.getByRole('button', { name: 'فعال‌کردن برنامه', exact: true }).click();
  await expect(page.getByLabel('عنوان برنامه')).toHaveValue(`برنامهٔ قبلی ${long}`);
  await expect(page.getByRole('radio', { name: /ویرایش برنامهٔ فعلی/ })).toBeChecked();
  await expectNoPageOverflow(page);
});

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
    test(`payment testing fits and stays labelled for ${role} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockAccount(page, role === 'coach' ? coach : student, false);
      const errors: string[] = [];
      const requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => { if (request.url().includes('/api/pay/')) requests.push(new URL(request.url()).pathname); });
      await page.goto(role === 'coach' ? '/coach/students/5/program' : '/program', { waitUntil: 'domcontentloaded' });
      if (role === 'coach') {
        await page.getByText('آزمایش پرداخت بدون درگاه').click();
        await expect(page.getByText(/تراکنشی ثبت نمی‌کند و برنامه را باز نمی‌کند/)).toBeVisible();
        await page.getByRole('button', { name: 'شروع آزمایش پرداخت' }).click();
        await expect(page.getByText(/سهم محاسبه‌شدهٔ مربی/)).toBeVisible();
        await page.getByRole('button', { name: 'فرض پرداخت موفق' }).click();
        await expect(page.getByRole('status')).toContainText('هیچ پول، تراکنش یا دسترسی واقعی ایجاد نشده است');
        expect(requests).toEqual(['/api/pay/practice']);
      } else {
        await expect(page.getByText(/بدون درگاه و پرداخت پول/)).toBeVisible();
        await page.getByRole('button', { name: /خرید و فعال‌سازی آزمایشی/ }).click();
        const dialog = page.getByRole('dialog', { name: 'تأیید خرید آزمایشی' });
        await expect(dialog).toContainText('پولی پرداخت نمی‌شود');
        await dialog.getByRole('button', { name: 'تأیید و فعال‌سازی آزمایشی' }).click();
        await expect(page.getByText(/دسترسی این برنامه آزمایشی است/)).toBeVisible();
        await expect(page.getByRole('button', { name: /پرداخت آنلاین و فعال‌سازی/ })).toHaveCount(0);
        expect(requests).toEqual(['/api/pay/test/start', '/api/pay/test/confirm']);
      }
      await expectNoPageOverflow(page);
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
    await expect(page.locator('.payment-practice').getByRole('status')).toContainText('انصراف فرض شد');
    await expectNoPageOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('coach enables a time-limited test purchase for one student on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, coach, false);
  await page.goto('/coach/students/5/program', { waitUntil: 'domcontentloaded' });
  await page.getByText('خرید آزمایشی برای این شاگرد', { exact: true }).click();
  await page.getByRole('button', { name: 'اجازهٔ خرید آزمایشی برای این شاگرد' }).click();
  const dialog = page.getByRole('dialog', { name: 'فعال‌کردن خرید آزمایشی' });
  await expect(dialog).toContainText('بدون پرداخت واقعی');
  await dialog.getByRole('button', { name: 'فعال‌کردن آزمایش' }).click();
  await expect(page.getByRole('button', { name: 'پایان دسترسی آزمایشی' })).toBeVisible();
  await expectNoPageOverflow(page);
});

for (const role of ['coach', 'admin'] as const) {
  test(`${role} sees separate real and test financial reports on a narrow phone`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await mockAccount(page, role === 'coach' ? coach : admin);
    await page.goto(role === 'coach' ? '/coach/transactions' : '/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
    const simulation = page.getByLabel('گزارش مالی آزمایشی');
    const live = page.getByLabel('گزارش مالی واقعی');
    await expect(simulation).toContainText('هیچ پولی جابه‌جا نشده');
    await expect(simulation).toContainText('۲٬۲۵۰٬۰۰۰ تومان');
    await expect(simulation).toContainText('۱ عدد');
    await expect(simulation.getByText('آزمایشی؛ بدون پول')).toHaveCount(4);
    await expect(simulation).toContainText('لغو / ناموفق');
    await expect(simulation).toContainText('در انتظار');
    await expect(simulation).toContainText('منقضی / پایان‌یافته');
    await expect(live).toContainText(role === 'coach' ? '۱۸٬۰۰۰٬۰۰۰ تومان' : '۲۰٬۰۰۰٬۰۰۰ تومان');
    await expect(live).toContainText('۸ عدد');
    await expectNoPageOverflow(page);
  });
}

test('admin explicitly enables and stops global test mode with warnings at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, admin);
  await page.goto('/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
  const control = page.getByLabel('مدیریت آزمایش سراسری خرید');
  await expect(control).toContainText('همهٔ شاگردان');
  await control.getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
  const startDialog = page.getByRole('dialog', { name: 'فعال‌کردن آزمایش سراسری' });
  await expect(startDialog).toContainText('بدون پرداخت بانکی');
  await startDialog.getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
  await expect(control).toContainText('آزمایش سراسری روشن است');
  await control.getByRole('button', { name: 'پایان آزمایش سراسری' }).click();
  const stopDialog = page.getByRole('dialog', { name: 'پایان آزمایش سراسری' });
  await expect(stopDialog).toContainText('گزارش آزمایشی باقی می‌ماند');
  await stopDialog.getByRole('button', { name: 'پایان آزمایش سراسری' }).click();
  await expect(control).toContainText('آزمایش سراسری خاموش است');
  await expectNoPageOverflow(page);
});

test('admin reloads the true mode if an activation response is lost', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, admin);
  let enabled = false;
  await page.route('**/api/admin/payment-test-mode', async (route) => {
    if (route.request().method() === 'PUT') {
      enabled = true;
      await route.abort('failed');
    } else {
      await route.fulfill({ json: { available: true, enabled, expiresAt: enabled ? new Date(Date.now() + 86_400_000).toISOString() : null } });
    }
  });
  await page.goto('/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
  const control = page.getByLabel('مدیریت آزمایش سراسری خرید');
  await control.getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
  await page.getByRole('dialog', { name: 'فعال‌کردن آزمایش سراسری' }).getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
  await expect(control).toContainText('آزمایش سراسری روشن است');
  await expect(control.getByRole('button', { name: 'پایان آزمایش سراسری' })).toBeVisible();
  await expectNoPageOverflow(page);
});

test('student cancellation stays locked and can start again without a fake bank page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, student, false);
  await page.goto('/program', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /خرید و فعال‌سازی آزمایشی/ }).click();
  const dialog = page.getByRole('dialog', { name: 'تأیید خرید آزمایشی' });
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(page.getByRole('status')).toContainText('خرید آزمایشی لغو');
  await expect(page.getByRole('button', { name: /خرید و فعال‌سازی آزمایشی/ })).toBeVisible();
  await expect(page.getByText('درگاه شبیه‌سازی‌شده؛ بدون انتقال پول')).toHaveCount(0);
  await expectNoPageOverflow(page);
});

for (const width of [320, 390, 1280]) {
  test(`registration screen supports both roles without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route('**/api/me', (route) => route.fulfill({ status: 401, json: { error: 'وارد شوید' } }));
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'حساب خودت را بساز' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ساخت حساب شخصی' })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByText('مربی هستم').click();
    await expect(page.getByRole('button', { name: 'ثبت درخواست مربی' })).toBeVisible();
    await expect(page.getByText(/پس از تأیید مدیر وارد می‌شوی/)).toBeVisible();
    await expectNoPageOverflow(page);
  });

  test(`student reviews coach invitation and consent without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, independent);
    await page.route('**/api/me/coach-invitation/preview', (route) => route.fulfill({ json: { coachName: coach.displayName, expiresAt: new Date(Date.now() + 86_400_000).toISOString() } }));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const connection = page.getByLabel('اتصال به مربی');
    await expect(connection.getByLabel('کد دعوت مربی')).toBeVisible();
    await connection.getByLabel('کد دعوت مربی').fill('A'.repeat(32));
    await connection.getByRole('button', { name: 'بررسی کد' }).click();
    await expect(connection.getByText(`اتصال به ${coach.displayName}`)).toBeVisible();
    await expect(connection.getByText(/دفتر خوراک و امکانات مدیریت برنامه/)).toBeVisible();
    await expect(connection.getByRole('button', { name: 'تأیید اتصال به مربی' })).toBeDisabled();
    await connection.getByRole('checkbox').check();
    await expect(connection.getByRole('button', { name: 'تأیید اتصال به مربی' })).toBeEnabled();
    await expectNoPageOverflow(page);
  });

  test(`coach creates a code and keeps manual student creation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockAccount(page, coach);
    await page.route('**/api/students', (route) => route.fulfill({ json: { students: [] } }));
    await page.route('**/api/coach/invitations', (route) => route.fulfill({ status: 201, json: { code: 'A'.repeat(32), expiresAt: new Date(Date.now() + 86_400_000).toISOString() } }));
    await page.goto('/coach', { waitUntil: 'domcontentloaded' });
    await expect(page.getByLabel('نام شاگرد جدید')).toBeVisible();
    await page.getByText('دعوت شاگرد با حساب خودش').click();
    await page.getByRole('button', { name: 'ساخت کد دعوت' }).click();
    await expect(page.getByText('A'.repeat(32))).toBeVisible();
    await expectNoPageOverflow(page);
  });
}

test('admin can find independent accounts and pending coach approvals on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockAccount(page, admin);
  await page.route('**/api/coaches', (route) => route.fulfill({ json: { coaches: [{ ...coach, isActive: false, selfRegistered: true, pendingApproval: true, password: null, studentCount: 0 }] } }));
  await page.route('**/api/admin/students*', (route) => route.fulfill({ json: { students: [independent] } }));
  await page.goto('/coach', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/در انتظار تأیید/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'همهٔ شاگردها' })).toBeVisible();
  await expect(page.getByLabel('نام کاربری دقیق')).toBeVisible();
  await expect(page.getByText(independent.username)).toBeVisible();
  for (const identity of await page.locator('.person-card__identity').all()) {
    expect((await identity.boundingBox())?.width).toBeGreaterThan(100);
  }
  await expectNoPageOverflow(page);
});
