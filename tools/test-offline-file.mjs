// Browser smoke test for the local single-file build; no account or network is used.
import { chromium, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 }, offline: true });
  const page = await context.newPage();
  await page.goto(pathToFileURL(resolve('dist/meety-offline.html')).href, { waitUntil: 'load' });
  await expect(page.getByText('جلسهٔ بعدی')).toBeVisible();
  await page.getByRole('button', { name: 'شروع تمرین' }).click();
  await page.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }).fill('20');
  await page.getByRole('button', { name: /ثبت ست و شروع استراحت/ }).click();
  await expect(page.getByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم/)).toBeVisible();
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByText(/ست ۱ ثبت شد · ۲۰ کیلوگرم/)).toBeVisible();
  console.log('PASS: offline file opened at 320px; a set was recorded and survived reload in Chromium.');
} finally { await browser.close(); }
