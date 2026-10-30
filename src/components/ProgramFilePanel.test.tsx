import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { WorkoutTemplate } from '../types';

const mock = vi.hoisted(() => ({
  user: { id: 12, role: 'student' }, token: 'test-token', scopeMatches: true, save: vi.fn(),
  sync: { phase: 'synced', lastSyncAt: '2026-10-30T00:00:00Z', conflicts: [] as { kind: string }[] },
}));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mock.user }) }));
vi.mock('../lib/accountScope', () => ({ isOfflineBuild: false, scopeMatchesAccount: () => mock.scopeMatches }));
vi.mock('../lib/api', () => ({ getToken: () => mock.token, getStoredUser: () => mock.user }));
vi.mock('../lib/personalSync', () => ({ getPersonalSyncState: () => mock.sync }));
vi.mock('./PersonalSync', () => ({ usePersonalSyncState: () => mock.sync }));
vi.mock('../lib/programPersistence', () => ({ saveProgram: mock.save }));

import { ProgramFilePanel } from './ProgramFilePanel';
const sample: WorkoutTemplate[] = [{ id: 'day-1', name: 'روز نمونه', dayLabel: 'اول', focus: 'سینه', durationMinutes: 40, description: '', exercises: [{ exerciseId: 'push-up', name: 'شنا', prescription: { sets: 3, minReps: 8, maxReps: 12, restSeconds: 60, targetRirLabel: '۲', minimumRir: 2 } }] }];
const select = () => fireEvent.change(screen.getByLabelText('انتخاب فایل برنامه'), { target: { files: [new File([JSON.stringify({ programme: sample })], 'program.json', { type: 'application/json' })] } });

beforeEach(() => {
  mock.user = { id: 12, role: 'student' }; mock.token = 'test-token'; mock.scopeMatches = true;
  mock.sync = { phase: 'synced', lastSyncAt: '2026-10-30T00:00:00Z', conflicts: [] };
  mock.save.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe('programme file confirmation', () => {
  it.each(['student', 'coach', 'admin'])('never saves %s account data until the chosen file is reviewed and confirmed', async (role) => {
    mock.user.role = role;
    render(<ProgramFilePanel program={[]} hasActiveSession={false} />);
    select();
    expect(await screen.findByText('روز نمونه')).toBeInTheDocument();
    expect(mock.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }));
    await waitFor(() => expect(mock.save).toHaveBeenCalledWith(sample, [], expect.objectContaining({ requireNoActiveSession: true, stillCurrent: expect.any(Function) })));
    expect(await screen.findByText(/وضعیت همگام‌سازی را در تنظیمات بررسی کن/)).toBeInTheDocument();
  });
  it('does not import while the initial sync or an active workout is unresolved', () => {
    mock.sync = { phase: 'idle', lastSyncAt: '', conflicts: [] };
    const view = render(<ProgramFilePanel program={[]} hasActiveSession={false} />);
    expect(screen.getByLabelText('انتخاب فایل برنامه')).toBeDisabled();
    mock.sync = { phase: 'synced', lastSyncAt: '2026-10-30T00:00:00Z', conflicts: [] };
    view.rerender(<ProgramFilePanel program={[]} hasActiveSession />);
    expect(screen.getByLabelText('انتخاب فایل برنامه')).toBeDisabled();
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('rejects a file after account, token, or sync changes instead of replacing a programme', async () => {
    render(<ProgramFilePanel program={[]} hasActiveSession={false} />);
    select(); await screen.findByText('روز نمونه');
    mock.token = 'other-token';
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و جایگزینی برنامه' }));
    expect(screen.getByRole('status')).toHaveTextContent('تغییر کرده است');
    expect(mock.save).not.toHaveBeenCalled();
  });
  it('reports bad files and preserves the current programme', async () => {
    render(<ProgramFilePanel program={sample} hasActiveSession={false} />);
    fireEvent.change(screen.getByLabelText('انتخاب فایل برنامه'), { target: { files: [new File(['{'], 'bad.json')] } });
    expect(await screen.findByText('فایل JSON معتبر نیست.')).toBeInTheDocument();
    expect(mock.save).not.toHaveBeenCalled();
  });
});
