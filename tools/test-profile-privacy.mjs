// End-to-end check: the owner's personal profile must never appear inside another account.
// Real API, disposable local database (PGlite folder), real Chromium.
import { chromium, expect } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../server/db.ts';
import { hashPassword } from '../server/auth.ts';
import { insertUser } from '../server/users.ts';

/** The owner's own numbers. They must never show up as somebody else's data. */
const ownerProfile = {
  age: 24, sex: 'مرد', heightCm: 190, weightKg: 79.9,
  primaryGoal: 'افزایش تودهٔ عضلانی', secondaryGoal: '', trainingExperience: 'تازه‌کار',
  trainingDays: 5, sessionMinutes: 60, dailyActivity: 'کم‌تحرک، بیشترتر از نشسته', sleepHours: '۴',
  stressLevel: 8, injuries: '', equipment: 'باشگاه کامل',
  workingWeightReferences: [{ label: 'پرس سینه', weightKg: 60, note: 'تخمین' }],
};
/** Almost the owner's profile, but the student's own value: it must survive the cleanup. */
const ownProfile = { ...ownerProfile, weightKg: 58, primaryGoal: 'کاهش وزن', stressLevel: 3 };

const at = '2026-10-30T09:00:00.000Z';

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
  child.stdout.resume(); child.stderr.resume();
}

async function main() {
  const dataDir = await mkdtemp(join(tmpdir(), 'meety-profile-privacy-'));
  const password = 'local-pass-123';
  const seeded = await openDatabase(join(dataDir, 'pgdata'));
  const adminId = await insertUser(seeded, { username: 'owner', passwordHash: hashPassword(password), role: 'admin', displayName: 'مالک', coachId: null, mustChangePassword: false, now: new Date(at) });
  const coachId = await insertUser(seeded, { username: 'coach.one', passwordHash: hashPassword(password), role: 'coach', displayName: 'مربی', coachId: null, mustChangePassword: false, now: new Date(at) });
  const copyStudent = await insertUser(seeded, { username: 'student.copy', passwordHash: hashPassword(password), role: 'student', displayName: 'شاگرد کپی', coachId, mustChangePassword: false, now: new Date(at) });
  const ownStudent = await insertUser(seeded, { username: 'student.own', passwordHash: hashPassword(password), role: 'student', displayName: 'شاگرد خودش', coachId, mustChangePassword: false, now: new Date(at) });
  const writeProfile = async (userId, value, operationId) => {
    await seeded.query(`INSERT INTO personal_data_records (user_id, kind, item_key, version, body, deleted, updated_at, last_operation_id)
      VALUES ($1, 'profile', 'main', 1, $2, 0, $3, $4)`, [userId, JSON.stringify(value), at, operationId]);
  };
  const shareWithCoach = async (userId, value) => {
    await seeded.query(`INSERT INTO student_profiles (student_id, body, share_with_coach, updated_at) VALUES ($1, $2, 1, $3)`, [userId, JSON.stringify(value), at]);
  };
  await writeProfile(adminId, ownerProfile, 'seed-owner-profile');
  // A legacy leak: the owner's own profile body stored inside another student's account.
  await writeProfile(copyStudent, ownerProfile, 'legacy-profile-migration');
  await shareWithCoach(copyStudent, ownerProfile);
  // Another student with their own values, which must never be touched by the cleanup.
  await writeProfile(ownStudent, ownProfile, 'seed-student-profile');
  await shareWithCoach(ownStudent, ownProfile);
  await seeded.close();

  const built = spawnSync('npm', ['run', 'build'], { stdio: 'inherit', env: { ...process.env, VITE_API_BASE: '', VITE_ANDROID_APK_URL: '' } });
  if (built.error || built.status !== 0) throw new Error('Could not build the test app.');
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server/index.ts'], { stdio: ['ignore', 'pipe', 'pipe'], env: {
    ...process.env, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(port), DATA_DIR: dataDir, STATIC_DIR: 'dist',
    MEETY_SECRET: 'profile-privacy-test-secret', ADMIN_USERNAME: '', ADMIN_PASSWORD: '',
    ZARINPAL_MERCHANT_ID: '', ZARINPAL_SANDBOX: 'true', STUDENT_TEST_PURCHASES: 'off', COACH_COMMISSION_PERCENT: '90',
    PAYMENT_PUBLIC_BASE_URL: '', MEETY_TRUSTED_PROXIES: '',
  } });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--disable-features=LocalNetworkAccessChecks'] });
  const errors = [];
  try {
    await awaitServer(child);
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
    const uiLogin = async (page, username) => {
      await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('نام کاربری', { exact: true }).fill(username);
      await page.getByLabel('رمز عبور', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'ورود', exact: true }).click();
      await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    };

    // The account that held a copy of the owner's profile starts empty.
    const copyPage = await newPage();
    await uiLogin(copyPage, 'student.copy');
    await copyPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    await expect(copyPage.getByLabel('سن')).toHaveValue('');
    await expect(copyPage.getByLabel(/وزن پروفایل/)).toHaveValue('');
    await expect(copyPage.getByLabel(/هدف اصلی/)).toHaveValue('');
    await expect(copyPage.getByText(/ثبت نشده/)).toBeVisible();
    console.log('PASS: the copy of the owner profile never reaches the student account; the profile reads as not registered.');

    // The coach sees no profile for that account either.
    const coachPage = await newPage();
    await uiLogin(coachPage, 'coach.one');
    await coachPage.goto(base + `/coach/students/${copyStudent}/profile`, { waitUntil: 'domcontentloaded' });
    await expect(coachPage.getByText('در حال حاضر اطلاعات پروفایل برای مربی نمایش داده نمی‌شود.')).toBeVisible();
    console.log('PASS: the coach has no access to the removed profile copy.');

    // A student with their own profile keeps it, and can delete it themselves.
    const ownPage = await newPage();
    await uiLogin(ownPage, 'student.own');
    await ownPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    await expect(ownPage.getByLabel(/وزن پروفایل/)).toHaveValue('58');
    await expect(ownPage.getByLabel(/هدف اصلی/)).toHaveValue('کاهش وزن');
    await ownPage.getByRole('button', { name: /پاک‌کردن پروفایل ذخیره‌شده/ }).click();
    await ownPage.getByRole('dialog').getByRole('button', { name: 'پاک کن' }).click();
    await expect(ownPage.getByLabel('سن')).toHaveValue('');
    await expect(ownPage.getByLabel(/وزن پروفایل/)).toHaveValue('');
    await expect(ownPage.getByText(/پروفایل ذخیره‌شده پاک شد/)).toBeVisible();
    console.log('PASS: the account owner deletes their own stored profile on request.');

    // The owner's own profile is untouched by all of this.
    const adminPage = await newPage();
    await uiLogin(adminPage, 'owner');
    await adminPage.goto(base + '/settings', { waitUntil: 'domcontentloaded' });
    await expect(adminPage.getByLabel(/وزن پروفایل/)).toHaveValue('79.9');
    await expect(adminPage.getByLabel(/هدف اصلی/)).toHaveValue('افزایش تودهٔ عضلانی');
    console.log('PASS: the owner keeps their own profile and working weights.');

    if (errors.length) throw new Error('Browser page errors: ' + errors.join('; '));
  } finally {
    await browser.close();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 6000);
      timer.unref();
      await new Promise((resolve) => child.once('exit', resolve));
      clearTimeout(timer);
    }
    await rm(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
