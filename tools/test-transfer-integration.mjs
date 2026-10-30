// End-to-end transfer and finance test. Only a disposable localhost PostgreSQL is accepted.
import { chromium, expect } from '@playwright/test';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

async function runScenario(base) {
  const pass = 'dummy-pass-for-local';
  const call = async (method, path, body, token, expected = 200) => {
    const response = await fetch(base + '/api' + path, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await response.json();
    if (response.status !== expected) throw new Error(`${method} ${path}: expected ${expected}, got ${response.status}: ${JSON.stringify(json)}`);
    return json;
  };
  const register = (username, role, displayName) => call('POST', '/auth/register', { username, password: pass, role, displayName, phoneNumber: '09121234567', dataNoticeAccepted: true }, null, 201);
  const login = async (username, password = pass) => call('POST', '/auth/login', { username, password });
  const admin = await login('localadmin', 'local-admin-password');
  await register('teststudent', 'student', 'شاگرد نمونه');
  await register('testcoacha', 'coach', 'مربی الف');
  await register('testcoachb', 'coach', 'مربی ب');
  const coaches = (await call('GET', '/coaches', undefined, admin.token)).coaches;
  const aId = coaches.find(x => x.username === 'testcoacha').id;
  const bId = coaches.find(x => x.username === 'testcoachb').id;
  await call('PUT', `/coaches/${aId}/active`, { active: true }, admin.token);
  await call('PUT', `/coaches/${bId}/active`, { active: true }, admin.token);
  const a = await login('testcoacha'); const b = await login('testcoachb'); const s = await login('teststudent');
  const personal = [{ id: 'personal-day', name: 'روز شخصی نمونه', focus: 'سینه', dayLabel: 'اول', durationMinutes: 30, description: '', exercises: [{ exerciseId: 'push-up', name: 'شنا', prescription: { sets: 3, minReps: 8, maxReps: 12, minimumRir: 0, targetRirLabel: '۲', restSeconds: 60, note: '' } }] }];
  await call('POST', '/me/personal-data/batch', { accountId: s.user.id, changes: [{ kind: 'program', key: 'main', baseVersion: 0, operationId: 'browser-e2e-personal', deleted: false, value: personal }] }, s.token);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== base) { errors.push('Unexpected cross-origin browser request blocked'); await route.abort(); }
      else await route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', err => errors.push(String(err)));
    return page;
  };
  const uiLogin = async (page, username, password = pass) => {
    await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('نام کاربری', { exact: true }).fill(username);
    await page.getByLabel('رمز عبور', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
  };
  const connect = async (page, code, coachName) => {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    const section = page.getByRole('region', { name: 'اتصال به مربی' });
    await section.getByLabel('کد دعوت مربی').fill(code);
    await section.getByRole('button', { name: 'بررسی کد' }).click();
    await expect(section).toContainText(`اتصال به ${coachName}`);
    await section.getByRole('checkbox').check();
    await section.getByRole('button', { name: 'تأیید اتصال به مربی' }).click();
    await expect(section).toContainText('حساب به مربی متصل است');
  };
  const withdraw = async page => {
    await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
    const section = page.getByRole('region', { name: 'اتصال به مربی' });
    await section.getByRole('button', { name: 'قطع دسترسی مربی' }).click();
    await page.getByRole('dialog', { name: 'قطع دسترسی مربی' }).getByRole('button', { name: 'قطع دسترسی', exact: true }).click();
    await expect(section).toContainText('دسترسی مربی قطع است');
  };
  const checkProgramFile = async (page, account, initialName) => {
    await page.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    const panel = page.locator('.program-file-panel');
    await panel.locator('summary').click();
    const input = panel.getByLabel('انتخاب فایل برنامه');
    await expect(input).toBeEnabled({ timeout: 15000 });
    let previousFile = null;
    if (initialName) {
      await expect(page.getByText(initialName).first()).toBeVisible();
      const promise = page.waitForEvent('download');
      await panel.getByRole('button', { name: 'دریافت فایل برنامهٔ این دستگاه' }).click();
      previousFile = await (await promise).path();
    }
    await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
    await expect(panel.getByRole('status')).toContainText('فایل JSON معتبر نیست');
    await input.setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(512 * 1024 + 1) });
    await expect(panel.getByRole('status')).toContainText('۵۱۲ کیلوبایت');
    const records = () => call('GET', `/me/personal-data?accountId=${account.user.id}`, undefined, account.token);
    const beforeProfile = (await records()).records.find(item => item.kind === 'profile')?.value;
    const imported = [{ ...personal[0], id: `fixture-${account.user.id}`, name: `روز واردشدهٔ ${account.user.id}` }];
    const fixture = { name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ programme: imported, profile: { primaryGoal: 'نباید وارد شود' }, sessions: ['not imported'] })) };
    await input.setInputFiles(fixture);
    await expect(panel).toContainText('۱ روز در فایل پیدا شد');
    await panel.getByRole('button', { name: 'انصراف' }).click();
    if (initialName) await expect(page.getByText(initialName).first()).toBeVisible();
    await input.setInputFiles(fixture);
    await panel.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }).click();
    await expect(page.getByText(imported[0].name).first()).toBeVisible();
    await expect.poll(async () => (await records()).records.find(item => item.kind === 'program' && !item.deleted)?.value?.[0]?.name, { timeout: 15000 }).toBe(imported[0].name);
    const after = (await records()).records;
    if (after.some(item => item.kind === 'session') || JSON.stringify(after.find(item => item.kind === 'profile')?.value) !== JSON.stringify(beforeProfile)) throw new Error('Programme file changed unrelated profile/session data');
    if (previousFile) {
      await input.setInputFiles(previousFile);
      await panel.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }).click();
      await expect(page.getByText(initialName).first()).toBeVisible();
      await expect.poll(async () => (await records()).records.find(item => item.kind === 'program' && !item.deleted)?.value?.[0]?.name, { timeout: 15000 }).toBe(initialName);
    }
  };
  try {
    const studentPage = await newPage(); const secondDevice = await newPage(); const coachPage = await newPage(); const adminPage = await newPage(); const adminSecondDevice = await newPage();
    await uiLogin(studentPage, 'teststudent'); await uiLogin(secondDevice, 'teststudent');
    for (const page of [studentPage, secondDevice]) {
      await page.goto(base + '/program', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('روز شخصی نمونه').first()).toBeVisible({ timeout: 15000 });
    }
    await uiLogin(coachPage, 'testcoacha'); await uiLogin(adminPage, 'localadmin', 'local-admin-password');
    await expect(adminPage).toHaveURL(`${base}/`);
    await expect(adminPage.getByText('برنامهٔ خودت را شروع کن')).toBeVisible();
    const bar = adminPage.getByRole('navigation', { name: 'ناوبری موبایل' }).locator('.mobile-nav__bar');
    for (const label of ['خانه', 'برنامه', 'پیشرفت']) await expect(bar.getByText(label, { exact: true })).toBeVisible();
    await bar.getByRole('button', { name: 'سایر بخش‌ها و امکانات' }).click();
    const more = adminPage.getByRole('dialog', { name: 'سایر بخش‌ها و امکانات میتی' });
    await more.getByRole('link', { name: /مدیریت مربی‌ها و شاگردها/ }).click();
    await expect(adminPage.getByRole('heading', { name: 'مدیریت مربی‌ها و باشگاه' })).toBeVisible();
    await expect(adminPage.getByText('مربی الف').first()).toBeVisible();
    await adminPage.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await adminPage.getByRole('link', { name: 'ساخت برنامهٔ شخصی' }).click();
    await adminPage.getByRole('button', { name: 'تعریف برنامه جدید از الگوها' }).click();
    const templates = adminPage.getByRole('dialog', { name: 'تعریف برنامهٔ تمرینی جدید' });
    await templates.getByRole('button', { name: /برنامهٔ ۳ روزه فول بادی/ }).click();
    await expect(adminPage.getByText('روز ۱: تمام بدن (اسکوات و سینه)').first()).toBeVisible();
    const adminRecords = () => call('GET', `/me/personal-data?accountId=${admin.user.id}`, undefined, admin.token);
    await expect.poll(async () => (await adminRecords()).records.some(item => item.kind === 'program' && !item.deleted), { timeout: 15000 }).toBe(true);
    await uiLogin(adminSecondDevice, 'localadmin', 'local-admin-password');
    await expect(adminSecondDevice).toHaveURL(`${base}/`);
    await expect(adminSecondDevice.getByRole('heading', { name: 'روز ۱: تمام بدن (اسکوات و سینه)' })).toBeVisible({ timeout: 15000 });
    await adminPage.goto(base + '/progress', { waitUntil: 'domcontentloaded' });
    await adminPage.locator('.bodyweight-form-card input[type="number"]').fill('78.5');
    await adminPage.getByRole('button', { name: 'ذخیرهٔ وزن' }).click();
    await expect.poll(async () => (await adminRecords()).records.some(item => item.kind === 'bodyweight' && item.value?.weightKg === 78.5), { timeout: 15000 }).toBe(true);
    await adminSecondDevice.goto(base + '/progress', { waitUntil: 'domcontentloaded' });
    await adminSecondDevice.reload({ waitUntil: 'domcontentloaded' });
    await expect(adminSecondDevice.getByRole('button', { name: 'حذف ثبت وزن 78.5 کیلوگرم' })).toBeVisible({ timeout: 15000 });
    // Three genuinely separate accounts start with empty profiles and retain their own references.
    for (const [page, account, age, label] of [[adminPage, admin, '39', 'حرکت مدیر'], [coachPage, a, '32', 'حرکت مربی'], [studentPage, s, '28', 'حرکت شاگرد']]) {
      await page.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
      const form = page.locator('.settings-form');
      await expect(form.getByLabel('سن', { exact: true })).toHaveValue('');
      await expect(form).toContainText('هنوز وزنه‌ای ثبت نکرده‌ای');
      await expect(page.getByText('انتقال داده‌های قدیمی', { exact: false })).toHaveCount(0);
      await form.getByLabel('سن', { exact: true }).fill(age);
      await form.getByRole('button', { name: 'افزودن وزنهٔ کاری' }).click();
      await form.getByLabel('نام حرکت وزنهٔ ۱').fill(label);
      await form.getByLabel('مقدار وزنهٔ ۱ به کیلوگرم').fill(age);
      await form.getByRole('button', { name: 'ذخیرهٔ پروفایل' }).click();
      await expect(form.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
      await expect.poll(async () => (await call('GET', `/me/personal-data?accountId=${account.user.id}`, undefined, account.token)).records.find(item => item.kind === 'profile')?.value?.workingWeightReferences?.[0]?.label, { timeout: 15000 }).toBe(label);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(form.getByLabel('نام حرکت وزنهٔ ۱')).toHaveValue(label);
    }
    await checkProgramFile(studentPage, s, 'روز شخصی نمونه');
    await checkProgramFile(coachPage, a, null);
    await checkProgramFile(adminPage, admin, 'روز ۱: تمام بدن (اسکوات و سینه)');
    await studentPage.goto(base + '/workout/personal-day', { waitUntil: 'domcontentloaded' });
    await expect(studentPage.getByLabel('وزنه به کیلوگرم')).toBeVisible();
    await studentPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    await studentPage.locator('.program-file-panel summary').click();
    await expect(studentPage.getByLabel('انتخاب فایل برنامه')).toBeDisabled();
    await studentPage.goto(base + '/workout/personal-day', { waitUntil: 'domcontentloaded' });
    await studentPage.locator('.workout-mobile-footer').getByRole('button', { name: 'خروج', exact: true }).click();
    await studentPage.getByRole('dialog', { name: 'لغو جلسه تمرین' }).getByRole('button', { name: 'لغو و حذف جلسه' }).click();
    await expect(studentPage).toHaveURL(`${base}/`);
    await expect.poll(async () => (await call('GET', `/me/personal-data?accountId=${s.user.id}`, undefined, s.token)).records.some(item => item.kind === 'session' && !item.deleted), { timeout: 15000 }).toBe(false);
    await call('GET', '/coaches', undefined, s.token, 403);
    await call('GET', '/admin/transactions', undefined, a.token, 403);
    // A coach's single reusable link opens registration or login and never attaches without consent.
    await coachPage.goto(base + '/coach', { waitUntil: 'domcontentloaded' });
    await coachPage.getByText('لینک ثبت‌نام شاگرد').click();
    await coachPage.getByRole('button', { name: 'دریافت لینک ثبت‌نام' }).click();
    await expect(coachPage.getByText('لینک آمادهٔ ارسال است.')).toBeVisible();
    const linkToken = (await call('POST', '/coach/registration-link', { accountId: a.user.id }, a.token)).token;
    const signupPage = await newPage();
    await signupPage.goto(`${base}/invite#${linkToken}`, { waitUntil: 'domcontentloaded' });
    await expect(signupPage.getByText('مربی الف', { exact: false })).toBeVisible();
    await signupPage.getByRole('link', { name: 'ثبت‌نام شاگرد' }).click();
    await signupPage.getByLabel('نام و نام خانوادگی').fill('شاگرد دعوتی');
    await signupPage.getByLabel('شماره موبایل').fill('09121234567');
    await signupPage.getByLabel('نام کاربری انگلیسی').fill('invitedstudent');
    await signupPage.getByLabel('رمز عبور', { exact: true }).fill(pass);
    await signupPage.getByLabel('تکرار رمز عبور').fill(pass);
    await signupPage.getByRole('checkbox').check();
    await signupPage.getByRole('button', { name: 'ساخت حساب شخصی' }).click();
    await expect(signupPage).toHaveURL(/\/invite$/, { timeout: 15000 });
    await expect(signupPage.getByText('مربی الف', { exact: false })).toBeVisible();
    await expect(signupPage.getByRole('button', { name: 'تأیید و اتصال به مربی' })).toBeDisabled();
    const invitedLogin = await login('invitedstudent');
    if (invitedLogin.user.coachId !== null) throw new Error('Registration silently connected an account without consent');
    await signupPage.getByRole('checkbox').check();
    await signupPage.getByRole('button', { name: 'تأیید و اتصال به مربی' }).click();
    await expect(signupPage.getByText(/به این مربی متصل است/)).toBeVisible();
    if ((await login('invitedstudent')).user.coachId !== a.user.id) throw new Error('Invited signup was not attached to the correct coach');
    await register('existinginvite', 'student', 'شاگرد موجود');
    const existingPage = await newPage();
    await existingPage.goto(`${base}/invite#${linkToken}`, { waitUntil: 'domcontentloaded' });
    await existingPage.getByRole('link', { name: 'ورود به حساب موجود' }).click();
    await existingPage.getByLabel('نام کاربری', { exact: true }).fill('existinginvite');
    await existingPage.getByLabel('رمز عبور', { exact: true }).fill(pass);
    await existingPage.getByRole('button', { name: 'ورود', exact: true }).click();
    await expect(existingPage).toHaveURL(/\/invite$/, { timeout: 15000 });
    await existingPage.getByRole('checkbox').check();
    await existingPage.getByRole('button', { name: 'تأیید و اتصال به مربی' }).click();
    await expect(existingPage.getByText(/به این مربی متصل است/)).toBeVisible();
    if ((await login('existinginvite')).user.coachId !== a.user.id) throw new Error('Existing account did not attach');
    const roster = (await call('GET', '/students', undefined, a.token)).students;
    if (!roster.some(x => x.username === 'invitedstudent') || !roster.some(x => x.username === 'existinginvite')) throw new Error('Invited accounts are missing from the coach roster');
    await signupPage.context().close(); await existingPage.context().close();

    await call('POST', '/coach/invitations', { accountId: bId }, a.token, 409);
    await call('DELETE', '/coach/invitations', { accountId: bId }, a.token, 409);
    const invitation = await call('POST', '/coach/invitations', {}, a.token, 201);
    await connect(studentPage, invitation.code, 'مربی الف');

    // Explicit consent is confirmed by the server before the UI reports success.
    await studentPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    const profileForm = studentPage.locator('.settings-form');
    const consent = profileForm.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    await expect(consent).toBeEnabled();
    await profileForm.getByLabel('سن', { exact: true }).fill('28');
    await profileForm.getByLabel('قد سانتی‌متر').fill('170');
    await profileForm.getByLabel('وزن پروفایل کیلوگرم').fill('70');
    await profileForm.getByLabel('هدف اصلی').fill('آمادگی');
    await profileForm.getByLabel('روزهای تمرین در هفته').fill('3');
    await profileForm.getByLabel('حداکثر زمان جلسه دقیقه').fill('45');
    await profileForm.getByLabel('سطح استرس ۱ تا ۱۰').fill('3');
    await consent.check();
    await profileForm.getByRole('button', { name: 'ذخیرهٔ پروفایل' }).click();
    await expect(profileForm.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
    const sharedProfile = await call('GET', `/students/${s.user.id}/profile`, undefined, a.token);
    if (!sharedProfile.shared || sharedProfile.profile?.workingWeightReferences?.[0]?.label !== 'حرکت شاگرد') throw new Error('Profile sharing did not use the student’s own approved references');
    if (JSON.stringify(sharedProfile).includes('حرکت مدیر') || JSON.stringify(sharedProfile).includes('حرکت مربی')) throw new Error('Profile sharing crossed account boundaries');
    await studentPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    await expect(studentPage.locator('.program-file-panel')).toHaveCount(0);
    await studentPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    await expect(consent).toBeChecked();
    await consent.uncheck();
    await profileForm.getByRole('button', { name: 'ذخیرهٔ پروفایل' }).click();
    await expect(profileForm.getByRole('button', { name: 'ذخیره شد' })).toBeVisible();
    if ((await call('GET', `/students/${s.user.id}/profile`, undefined, a.token)).shared) throw new Error('Profile sharing was not revoked');

    // Two isolated browser contexts deliberately edit the same server-backed day from the same base.
    for (const page of [studentPage, secondDevice]) {
      await page.goto(base + '/nutrition', { waitUntil: 'domcontentloaded' });
      const diary = page.getByRole('region', { name: 'ثبت وعده‌های روزانه' });
      await expect(diary.getByRole('button', { name: 'افزودن وعده' })).toBeVisible();
    }
    const firstDiary = studentPage.getByRole('region', { name: 'ثبت وعده‌های روزانه' });
    const staleDiary = secondDevice.getByRole('region', { name: 'ثبت وعده‌های روزانه' });
    const day = await firstDiary.getByLabel('روز', { exact: true }).getAttribute('data-iso-date');
    for (const [diary, name] of [[firstDiary, 'صبحانه دستگاه اول'], [staleDiary, 'ناهار دستگاه دوم']]) {
      await diary.getByRole('region', { name: 'افزودن وعده' }).getByLabel('نام وعده').fill(name);
      await diary.getByRole('button', { name: 'افزودن وعده' }).click();
    }
    await firstDiary.getByRole('button', { name: 'ذخیرهٔ این روز' }).click();
    await expect(firstDiary).toContainText('ثبت این روز ذخیره شد.');
    await staleDiary.getByRole('button', { name: 'ذخیرهٔ این روز' }).click();
    const diaryConflict = staleDiary.locator('.draft-conflict');
    await expect(diaryConflict).toBeVisible();
    await diaryConflict.getByText('بررسی نسخهٔ تازه').click();
    await expect(diaryConflict).toContainText('صبحانه دستگاه اول');
    await expect(staleDiary.getByLabel('نام وعده').first()).toHaveValue('ناهار دستگاه دوم');
    await diaryConflict.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }).click();
    await secondDevice.getByRole('dialog', { name: 'نگه‌داشتن پیش‌نویس' }).getByRole('button', { name: 'تأیید پیش‌نویس من' }).click();
    await staleDiary.getByRole('button', { name: 'ذخیرهٔ این روز' }).click();
    await expect(staleDiary).toContainText('ثبت این روز ذخیره شد.');
    const persistedDiary = await call('GET', `/me/diary/${day}?accountId=${s.user.id}`, undefined, s.token);
    if (persistedDiary.diary.meals[0]?.name !== 'ناهار دستگاه دوم') throw new Error('Diary resolution was not persisted');

    // The weekly coach editor uses the same conflict workflow across two independent contexts.
    const coachSecondDevice = await newPage();
    await uiLogin(coachSecondDevice, 'testcoacha');
    for (const page of [coachPage, coachSecondDevice]) {
      await page.goto(base + `/coach/students/${s.user.id}/nutrition`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByLabel('کالری کیلوکالری')).toBeVisible();
    }
    await coachPage.getByLabel('کالری کیلوکالری').fill('2300');
    await coachSecondDevice.getByLabel('کالری کیلوکالری').fill('2400');
    await coachPage.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }).click();
    await expect(coachPage.getByText('برنامه ذخیره شد.', { exact: true })).toBeVisible();
    await coachSecondDevice.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }).click();
    const planConflict = coachSecondDevice.locator('.draft-conflict');
    await expect(planConflict).toBeVisible();
    await planConflict.getByText('بررسی نسخهٔ تازه').click();
    await expect(planConflict).toContainText('۲٬۳۰۰');
    await expect(coachSecondDevice.getByLabel('کالری کیلوکالری')).toHaveValue('2400');
    await planConflict.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }).click();
    await coachSecondDevice.getByRole('dialog', { name: 'نگه‌داشتن پیش‌نویس' }).getByRole('button', { name: 'تأیید پیش‌نویس من' }).click();
    await coachSecondDevice.getByRole('button', { name: 'ذخیرهٔ برنامهٔ هفته' }).click();
    await expect(coachSecondDevice.getByText('برنامه ذخیره شد.', { exact: true })).toBeVisible();
    const persistedPlan = await call('GET', `/students/${s.user.id}/nutrition?accountId=${a.user.id}`, undefined, a.token);
    if (persistedPlan.plan.targets.kcal !== 2400) throw new Error('Weekly nutrition resolution was not persisted');
    const input = { title: 'برنامه اول مربی الف', priceTomans: 100000, days: [{ name: 'روز تمرین الف', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
    const first = (await call('PUT', `/students/${s.user.id}/program`, input, a.token)).program;
    const checkout = await call('POST', '/pay/start', { expectedId: first.id, expectedVersion: first.version }, s.token, 201);
    const verify = await call('POST', '/pay/verify', { authority: checkout.authority, status: 'OK' }, s.token);
    if (!verify.success) throw new Error('Sandbox checkout did not verify');
    const empty = await call('GET', `/students/${s.user.id}/nutrition`, undefined, a.token);
    await call('PUT', `/students/${s.user.id}/nutrition`, { ...empty.plan, targets: { kcal: 2100, proteinG: 120, carbsG: null, fatG: null } }, a.token);
    await call('PUT', `/students/${s.user.id}/ai-settings`, { age: 31, limitations: 'محدودیت محرمانه الف' }, a.token);
    await call('POST', `/students/${s.user.id}/chat`, { body: 'پیام محرمانه الف' }, a.token, 201);
    await studentPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    await expect(studentPage.getByText('روز تمرین الف').first()).toBeVisible();
    await withdraw(studentPage);
    const connection = studentPage.getByRole('region', { name: 'اتصال به مربی' });
    await connection.getByRole('button', { name: 'بازگشت به برنامهٔ شخصی' }).click();
    await studentPage.getByRole('dialog', { name: 'بازگشت به برنامهٔ شخصی' }).getByRole('button', { name: 'فعال‌کردن برنامهٔ شخصی' }).click();
    await expect(connection).toContainText('برنامهٔ شخصی فعال است');
    await studentPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    await expect(studentPage.getByText('روز شخصی نمونه').first()).toBeVisible();
    await studentPage.getByText('بایگانی برنامه‌های قبلی').click();
    await expect(studentPage.getByText('برنامه اول مربی الف')).toBeVisible();
    const inviteB = await call('POST', '/coach/invitations', {}, b.token, 201);
    await connect(studentPage, inviteB.code, 'مربی ب');
    await call('GET', `/students/${s.user.id}/program`, undefined, a.token, 404);
    const bProgramme = await call('GET', `/students/${s.user.id}/program`, undefined, b.token);
    const bDiet = await call('GET', `/students/${s.user.id}/nutrition`, undefined, b.token);
    const bHealth = await call('GET', `/students/${s.user.id}/ai-settings`, undefined, b.token);
    const bChat = await call('GET', `/students/${s.user.id}/chat`, undefined, b.token);
    if (bProgramme.program !== null || bDiet.plan.targets.kcal !== null || bHealth.biometrics.limitations || bChat.messages.length) throw new Error('Former coach information leaked to the new coach');
    const history = await call('GET', '/me/ai-settings/archive', undefined, s.token);
    const messages = await call('GET', `/me/chat/archive/${aId}`, undefined, s.token);
    if (!history.records.some(x => x.biometrics.limitations === 'محدودیت محرمانه الف') || messages.messages[0]?.body !== 'پیام محرمانه الف') throw new Error('Student archive missing data');
    await studentPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    await studentPage.getByText('سوابق مربیان قبلی').click();
    await studentPage.getByText('مربی مربی الف').first().click();
    await expect(studentPage.getByText('محدودیت محرمانه الف')).toBeVisible();
    await coachPage.goto(base + '/coach/transactions', { waitUntil: 'domcontentloaded' });
    await expect(coachPage.getByText(/شاگرد: شاگرد نمونه/).first()).toBeVisible();
    await adminPage.goto(base + '/coach/admin/transactions', { waitUntil: 'domcontentloaded' });
    await expect(adminPage.getByText(/شاگرد: شاگرد نمونه/).first()).toBeVisible();
    if ((await call('GET', '/coach/transactions', undefined, b.token)).transactions.length) throw new Error('Wrong coach can see previous coach ledger');
    await call('PUT', `/students/${s.user.id}/program`, { ...input, title: 'برنامه مربی ب', priceTomans: 200000, saveMode: 'new', expectedId: null, expectedVersion: 0 }, b.token);
    const testControl = adminPage.getByLabel('مدیریت آزمایش سراسری خرید');
    await testControl.getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
    await adminPage.getByRole('dialog', { name: 'فعال‌کردن آزمایش سراسری' }).getByRole('button', { name: 'فعال‌کردن آزمایش سراسری' }).click();
    await expect(testControl).toContainText('آزمایش سراسری روشن است');
    await studentPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
    await studentPage.getByRole('button', { name: /خرید و فعال‌سازی آزمایشی/ }).click();
    await studentPage.getByRole('dialog', { name: 'تأیید خرید آزمایشی' }).getByRole('button', { name: 'تأیید و فعال‌سازی آزمایشی' }).click();
    await expect(studentPage.getByText(/دسترسی این برنامه آزمایشی است/)).toBeVisible();
    const testProgram = await call('GET', '/me/program', undefined, s.token);
    const bReport = await call('GET', '/coach/transactions', undefined, b.token);
    if (testProgram.isPaid || !testProgram.isTestPurchase || bReport.testTransactions.length !== 1 || bReport.testTransactions[0].status !== 'paid' || bReport.transactions.length) throw new Error('Test purchase/ledger is not correctly isolated');
    await testControl.getByRole('button', { name: 'پایان آزمایش سراسری' }).click();
    await adminPage.getByRole('dialog', { name: 'پایان آزمایش سراسری' }).getByRole('button', { name: 'پایان آزمایش سراسری' }).click();
    await expect(testControl).toContainText('آزمایش سراسری خاموش است');
    if ((await call('GET', '/me/program', undefined, s.token)).isTestPurchase) throw new Error('Test access persisted after stop');
    if ((await call('GET', '/admin/transactions', undefined, admin.token)).testTransactions.length !== 1) throw new Error('Admin test ledger was not preserved');
    await withdraw(studentPage);
    const inviteAgain = await call('POST', '/coach/invitations', {}, a.token, 201);
    await connect(studentPage, inviteAgain.code, 'مربی الف');
    await coachPage.goto(base + `/coach/students/${s.user.id}/program`, { waitUntil: 'domcontentloaded' });
    await coachPage.getByText('برنامه‌های قبلی این شاگرد').click();
    await expect(coachPage.getByText('برنامه اول مربی الف')).toBeVisible();
    await coachPage.getByRole('button', { name: 'فعال‌کردن این برنامه' }).click();
    await coachPage.getByRole('dialog', { name: 'فعال‌کردن برنامهٔ قبلی' }).getByRole('button', { name: 'فعال‌کردن برنامه', exact: true }).click();
    await expect(coachPage.getByLabel('عنوان برنامه')).toHaveValue('برنامه اول مربی الف');
    const restored = await call('GET', '/me/program', undefined, s.token);
    if (!restored.isPaid || restored.program.id !== first.id || restored.program.version !== 2147483648) throw new Error('Restored purchase was not preserved');
    // Optional owner-supplied private fixture: test only inside the disposable admin account.
    if (process.env.MEETY_PRIVATE_PROGRAM_FILE) {
      const filePath = process.env.MEETY_PRIVATE_PROGRAM_FILE;
      const fixture = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(fixture.programme)) throw new Error('Private fixture does not contain a programme');
      await adminPage.goto(base + '/program', { waitUntil: 'domcontentloaded' });
      const panel = adminPage.locator('.program-file-panel');
      await panel.locator('summary').click();
      const input = panel.getByLabel('انتخاب فایل برنامه');
      await expect(input).toBeEnabled({ timeout: 15000 });
      await input.setInputFiles(filePath);
      await expect(panel.getByRole('button', { name: 'تأیید و جایگزینی برنامه' })).toBeVisible();
      await panel.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }).click();
      await expect.poll(async () => isDeepStrictEqual((await adminRecords()).records.find(item => item.kind === 'program' && !item.deleted)?.value, fixture.programme), { timeout: 20000 }).toBe(true);
      console.log('PASS: supplied private programme imported through Chromium into the disposable account; no private content printed.');
    }
    if (errors.length) throw new Error('Browser page errors: ' + errors.join('; '));
    console.log('PASS: real Node API + disposable PostgreSQL + Chromium: admin personal home, programme and weight synced to a second device, club access via More and role restrictions; independent programme and concurrent diary/weekly nutrition conflict resolution on 2 devices; reusable coach-link signup and login with explicit consent; profile sharing and revocation; consent A → personal → B → A; previous coach privacy/archives; sandbox purchase, isolated UI test purchase and coach/admin ledgers; offer restore and paid entitlement. No real payment.');
  } finally {
    await browser.close();
  }

}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function awaitServer(child) {
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error('Test server did not start in time.')); }, 60000);
    const onData = (chunk) => {
      output = (output + chunk.toString()).slice(-6000);
      if (output.includes('Meety API listening')) { cleanup(); resolve(); }
    };
    const onExit = () => { cleanup(); reject(new Error(`Test server exited before startup: ${output}`)); };
    const onError = (error) => { cleanup(); reject(error); };
    const cleanup = () => { clearTimeout(timer); child.stdout.off('data', onData); child.stderr.off('data', onData); child.off('exit', onExit); child.off('error', onError); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.once('exit', onExit); child.once('error', onError);
  });
  // Drain future logs without printing environment or test data.
  child.stdout.resume(); child.stderr.resume();
}

async function main() {
  const raw = process.env.TEST_POSTGRES_URL;
  if (!raw) throw new Error('Set TEST_POSTGRES_URL to a disposable local PostgreSQL database; never use production.');
  const target = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || !target.pathname.slice(1)) {
    throw new Error('TEST_POSTGRES_URL must name a disposable localhost PostgreSQL database.');
  }
  // Never let an operator's API origin be embedded in the test build.
  const built = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_API_BASE: '', VITE_ANDROID_APK_URL: '' } });
  if (built.error || built.status !== 0) throw new Error('Could not build the test app.');
  const schema = `meety_transfer_e2e_${randomBytes(10).toString('hex')}`;
  const root = new pg.Client({ connectionString: raw });
  let child = null;
  let created = false;
  let dataDir;
  await root.connect();
  try {
    await root.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    target.searchParams.set('options', `-c search_path=${schema}`);
    dataDir = await mkdtemp(join(tmpdir(), 'meety-transfer-e2e-'));
    const port = await availablePort();
    child = spawn(process.execPath, ['server/index.ts'], { stdio: ['ignore', 'pipe', 'pipe'], env: {
      ...process.env, NODE_ENV: 'development', DATABASE_URL: target.toString(), HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir,
      MEETY_SECRET: randomBytes(32).toString('hex'), ADMIN_USERNAME: 'localadmin', ADMIN_PASSWORD: 'local-admin-password',
      ZARINPAL_MERCHANT_ID: '', ZARINPAL_SANDBOX: 'true', STUDENT_TEST_PURCHASES: 'on', COACH_COMMISSION_PERCENT: '90',
      PAYMENT_PUBLIC_BASE_URL: '', MEETY_TRUSTED_PROXIES: '',
    } });
    await awaitServer(child);
    await runScenario(`http://127.0.0.1:${port}`);
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
      timer.unref();
      await new Promise((resolve) => child.once('exit', resolve));
      clearTimeout(timer);
    }
    try { if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await root.end(); if (dataDir) await rm(dataDir, { recursive: true, force: true }); }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
