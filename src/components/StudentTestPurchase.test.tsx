import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveProgram, getAssignedMeta, setAssignedMeta, setAssignedProgram, type AssignedMeta } from '../lib/programStore';
import { StudentTestPurchase } from './StudentTestPurchase';

const authority = 'TEST-01234567-89ab-cdef-0123-456789abcdef';
const program: AssignedMeta = { id: 'offer-1', version: 2, title: 'برنامهٔ تمرینی', priceTomans: 100000, coachName: 'مربی', isPaid: false, testPurchaseAvailable: true };
const fullProgram = { id: program.id, version: program.version, title: program.title, priceTomans: program.priceTomans, updatedAt: '2026-10-28', days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const expiry = '2026-10-29T08:00:00Z';

beforeEach(() => {
  window.localStorage.setItem('meety.session-token', 'tok-student-0000000000000001');
  setAssignedMeta(program);
  setAssignedProgram([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  setAssignedMeta(null);
  setAssignedProgram([]);
});

describe('student test purchase', () => {
  it('starts and confirms a labelled test checkout, then opens the programme as test access, not paid', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(path);
      if (path === '/api/pay/test/start') {
        expect(JSON.parse(String(init?.body))).toEqual({ expectedId: 'offer-1', expectedVersion: 2 });
        return response({ simulation: true, authority, amountTomans: 100000, expiresAt: expiry });
      }
      if (path === '/api/pay/test/confirm') {
        expect(JSON.parse(String(init?.body))).toEqual({ authority, result: 'success' });
        return response({ simulation: true, success: true, amountTomans: 100000, expiresAt: expiry });
      }
      if (path === '/api/me/program') return response({ program: fullProgram, coachName: 'مربی', isPaid: false, isTestPurchase: true, testPurchaseExpiresAt: expiry });
      return response({ error: 'unexpected' }, 404);
    }));
    const user = userEvent.setup();
    render(<StudentTestPurchase program={program} />);
    expect(screen.getByText(/پول واقعی پرداخت نمی‌شود/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'شروع خرید آزمایشی' }));
    expect(await screen.findByText('درگاه شبیه‌سازی‌شده؛ بدون انتقال پول')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'تأیید خرید آزمایشی' }));
    expect(await screen.findByRole('button', { name: 'تأیید خرید آزمایشی' })).toBeEnabled();
    expect(getAssignedMeta()).toMatchObject({ id: 'offer-1', isPaid: false, isTestPurchase: true });
    expect(getActiveProgram()[0]?.exercises[0]?.name).toBe('شنا');
    expect(calls).toEqual(['/api/pay/test/start', '/api/pay/test/confirm', '/api/me/program']);
  });

  it('cancels without unlocking and allows another attempt', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      calls.push(path);
      if (path === '/api/pay/test/start') return response({ simulation: true, authority, amountTomans: 100000, expiresAt: expiry });
      if (path === '/api/pay/test/confirm') return response({ simulation: true, success: false, amountTomans: 100000, expiresAt: expiry });
      return response({ error: 'unexpected' }, 404);
    }));
    const user = userEvent.setup();
    render(<StudentTestPurchase program={program} />);
    await user.click(screen.getByRole('button', { name: 'شروع خرید آزمایشی' }));
    await user.click(await screen.findByRole('button', { name: 'انصراف از خرید آزمایشی' }));
    expect(await screen.findByRole('status')).toHaveTextContent('برنامه همچنان قفل است');
    expect(getActiveProgram()).toEqual([]);
    expect(getAssignedMeta()?.isPaid).toBe(false);
    expect(screen.getByRole('button', { name: 'شروع خرید آزمایشی' })).toBeEnabled();
    expect(calls).toEqual(['/api/pay/test/start', '/api/pay/test/confirm']);
  });

  it('does not treat an unlabelled result as a test purchase', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ simulation: false, authority, amountTomans: 100000, expiresAt: expiry })));
    const user = userEvent.setup();
    render(<StudentTestPurchase program={program} />);
    await user.click(screen.getByRole('button', { name: 'شروع خرید آزمایشی' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('خرید آزمایشی شروع نشد');
    expect(getActiveProgram()).toEqual([]);
  });
});
