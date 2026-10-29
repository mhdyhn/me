// End-to-end transfer and finance test. Only a disposable localhost PostgreSQL is accepted.
import { chromium, expect } from '@playwright/test';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  try {
    const studentPage = await newPage(); const secondDevice = await newPage(); const coachPage = await newPage(); const adminPage = await newPage();
    await uiLogin(studentPage, 'teststudent'); await uiLogin(secondDevice, 'teststudent');
    for (const page of [studentPage, secondDevice]) {
      await page.goto(base + '/program', { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('روز شخصی نمونه').first()).toBeVisible({ timeout: 15000 });
    }
    await uiLogin(coachPage, 'testcoacha'); await uiLogin(adminPage, 'localadmin', 'local-admin-password');
    const invitation = await call('POST', '/coach/invitations', {}, a.token, 201);
    await connect(studentPage, invitation.code, 'مربی الف');
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
    if (errors.length) throw new Error('Browser page errors: ' + errors.join('; '));
    console.log('PASS: real Node API + disposable PostgreSQL + Chromium: independent program on 2 devices; consent A → personal → B → A; previous coach privacy/archives; sandbox purchase, isolated UI test purchase and coach/admin ledgers; offer restore and paid entitlement. No real payment.');
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
