import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAssignedProgram } from '../lib/assignedProgram';
import { getActiveProgram, getAssignedMeta, setAssignedMeta, setAssignedProgram, type AssignedMeta } from '../lib/programStore';
import { Layout } from './Layout';

vi.mock('../context/GymProvider', () => ({ useGym: () => ({ activeSession: null, storageWarning: null }) }));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: { id: 2, role: 'student' }, signOut: vi.fn() }) }));
vi.mock('./PersonalSync', () => ({ usePersonalSyncState: () => ({ phase: 'synced', message: '' }) }));
vi.mock('../lib/motivationalQuotes', () => ({ useMotivationalQuote: () => ({ title: '', subtitle: '' }) }));
vi.mock('../lib/assignedProgram', () => ({ loadAssignedProgram: vi.fn(async () => {}) }));

const now = new Date('2026-10-28T12:00:00Z');
const meta: AssignedMeta = { id: 'test-offer', version: 1, title: 'برنامه', priceTomans: 100000, coachName: 'مربی', isPaid: false, isTestPurchase: true, testPurchaseExpiresAt: new Date(now.getTime() + 1000).toISOString() };
const workout = { id: 'day', name: 'روز اول', dayLabel: 'روز اول', focus: '', durationMinutes: 1, description: '', exercises: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  setAssignedMeta(meta);
  setAssignedProgram([workout]);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  setAssignedMeta(null);
  setAssignedProgram([]);
});

function mount() {
  render(<MemoryRouter initialEntries={['/program']}><Layout /></MemoryRouter>);
}

describe('temporary programme access', () => {
  it('clears the displayed test programme and rechecks the server at its deadline', async () => {
    mount();
    expect(screen.getByText(/دسترسی این برنامه آزمایشی است/)).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1250); });
    expect(getAssignedMeta()?.isTestPurchase).toBe(false);
    expect(getActiveProgram()).toEqual([]);
    expect(loadAssignedProgram).toHaveBeenCalledTimes(1);
  });

  it('rechecks access on focus so a coach revocation can close the programme', async () => {
    vi.mocked(loadAssignedProgram).mockImplementation(async () => {
      setAssignedMeta({ ...meta, isTestPurchase: false });
      setAssignedProgram([]);
    });
    mount();
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(loadAssignedProgram).toHaveBeenCalledTimes(1);
    expect(getAssignedMeta()?.isTestPurchase).toBe(false);
    expect(getActiveProgram()).toEqual([]);
  });

  it('does not repeatedly recheck immediately when the device clock is ahead', async () => {
    setAssignedMeta({ ...meta, testPurchaseExpiresAt: new Date(now.getTime() - 1000).toISOString() });
    mount();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadAssignedProgram).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(55000); });
    expect(loadAssignedProgram).toHaveBeenCalledTimes(1);
  });
});
