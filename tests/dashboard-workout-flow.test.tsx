import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GymProvider } from '../src/context/GymProvider';
import { workoutTemplates } from '../src/data/workouts';
import { db } from '../src/lib/db';
import { setActiveProgram } from '../src/lib/programStore';
import { Dashboard } from '../src/pages/Dashboard';
import { Workout } from '../src/pages/Workout';

const mocks = vi.hoisted(() => ({ role: 'admin' }));
vi.mock('../src/context/SessionContext', () => ({ useSession: () => ({ user: { id: 11, role: mocks.role, coachId: mocks.role === 'student' ? 4 : null } }) }));
vi.mock('../src/components/PersonalSync', () => ({ usePersonalSyncState: () => ({ phase: 'synced', lastSyncAt: '2026-10-30T08:00:00Z', conflicts: [], message: '' }) }));
vi.mock('../src/components/CoachConnection', () => ({ CoachConnection: () => null }));

function renderApp() {
  return render(<GymProvider><MemoryRouter initialEntries={['/']}><Routes>
    <Route path="/" element={<Dashboard />} /><Route path="/workout/:templateId" element={<Workout />} />
  </Routes></MemoryRouter></GymProvider>);
}

beforeEach(async () => {
  await db.sessions.clear(); await db.syncDeleted.clear(); await db.preferences.clear();
  await db.bodyweights.clear(); await db.nutritionDays.clear();
  setActiveProgram(structuredClone(workoutTemplates));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(['admin', 'student'])('%s workout lifecycle from home', (role) => {
  it('starts, saves for later, resumes, finishes and returns to the next start', async () => {
    mocks.role = role;
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'شروع تمرین' }));
    await screen.findByText('ست فعلی');
    await user.type(screen.getByRole('spinbutton', { name: 'وزنه به کیلوگرم' }), '20');
    await user.click(screen.getByRole('button', { name: /ثبت ست و شروع استراحت/ }));
    await screen.findByText(/ست ۱ ثبت شد/);
    await user.click(screen.getByRole('button', { name: /^خروج$/ }));
    expect(await screen.findByRole('button', { name: 'ادامهٔ تمرین' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ادامهٔ تمرین' }));
    await screen.findByText(/ست ۱ ثبت شد/);
    confirmation.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /پایان و ثبت جلسه/ }));
    expect(await screen.findByText(/تمرین کامل شد/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /بازگشت به صفحهٔ اصلی/ }));
    expect(await screen.findByRole('button', { name: 'شروع تمرین' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ادامهٔ تمرین' })).not.toBeInTheDocument();
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe('completed');
    expect(sessions[0]?.exercises[0]?.sets).toHaveLength(1);
  });

  it('does not leave an empty open session when the user confirms cancellation', async () => {
    mocks.role = role;
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'شروع تمرین' }));
    await screen.findByText('ست فعلی');
    await user.click(screen.getByRole('button', { name: /^خروج$/ }));
    expect(screen.getByText('ست فعلی')).toBeInTheDocument();
    expect(await db.sessions.count()).toBe(1);
    confirmation.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /^خروج$/ }));
    expect(await screen.findByRole('button', { name: 'شروع تمرین' })).toBeInTheDocument();
    await waitFor(async () => expect(await db.sessions.count()).toBe(0));
  });
});
