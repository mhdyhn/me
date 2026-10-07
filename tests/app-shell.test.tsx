import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { db } from '../src/lib/db';

beforeEach(async () => {
  window.history.replaceState({}, '', '/');
  await db.sessions.clear();
  await db.bodyweights.clear();
  await db.nutritionDays.clear();
  await db.preferences.clear();
});
afterEach(() => cleanup());

describe('complete application shell', () => {
  it('boots the dashboard through the production router and shared navigation', async () => {
    render(<App />);
    expect(await screen.findByText('جلسهٔ بعدی')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'ناوبری اصلی' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'ناوبری موبایل' })).toBeInTheDocument();
  });

  it('supports a direct exercise-detail URL without a prior dashboard visit', async () => {
    window.history.replaceState({}, '', '/exercise/barbell-bench-press');
    render(<App />);
    expect(await screen.findByText('پرس سینه با هالتر')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('پویانمایی حرکت فعال است');
  });
});
