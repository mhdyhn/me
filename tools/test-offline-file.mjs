// Browser smoke test for the local single-file build; no account or network is used.
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, offline: true });
  const page = await context.newPage();
  await page.goto(pathToFileURL(resolve('dist/meety-offline.html')).href, { waitUntil: 'load' });
  await expect(page.getByText('برنامهٔ خودت را شروع کن')).toBeVisible();
  await page.getByRole('link', { name: 'ساخت برنامهٔ شخصی' }).click();
  const panel = page.locator('.program-file-panel');
  await panel.locator('summary').click();
  const fixture = [{ id: 'offline-test-day', name: 'روز نمونهٔ آفلاین', focus: 'تمرین', dayLabel: 'روز اول', durationMinutes: 30, description: '', exercises: [{ exerciseId: 'push-up', name: 'شنا', prescription: { sets: 3, minReps: 8, maxReps: 12, minimumRir: 1, targetRirLabel: '۱–۲', restSeconds: 60 } }] }];
  await panel.getByLabel('انتخاب فایل برنامه').setInputFiles({ name: 'offline-program.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ programme: fixture })) });
  await panel.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }).click();
  await expect(page.getByText('روز نمونهٔ آفلاین').first()).toBeVisible();
  await page.getByRole('link', { name: 'خانه', exact: true }).first().click();
  await expect(page.getByText('جلسهٔ بعدی')).toBeVisible();
  await page.getByRole('button', { name: 'شروع تمرین' }).click();
  await page.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }).fill('20');
  await page.getByRole('button', { name: /ثبت ست و شروع استراحت/ }).click();
  await expect(page.getByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم/)).toBeVisible();
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم/)).toBeVisible();
  console.log('PASS: offline file opened at 320px without a default plan; an explicitly imported plan and a logged set survived reload in Chromium.');
} finally { await browser.close(); }
