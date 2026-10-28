import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStoredUser, setToken, USER_KEY, type PublicUser } from '../lib/api';
import { getActiveProgram, isProgramReadOnly, setActiveProgram } from '../lib/programStore';

const mocks = vi.hoisted(() => ({ loadAssigned: vi.fn(), loadStored: vi.fn() }));
vi.mock('../lib/assignedProgram', () => ({ loadAssignedProgram: mocks.loadAssigned }));
vi.mock('../lib/programPersistence', () => ({ loadStoredProgram: mocks.loadStored }));
import { SessionProvider, useSession } from './SessionContext';

const independent: PublicUser = { id: 24, username: 'student', role: 'student', displayName: 'سارا', coachId: null, selfRegistered: true, coachAccess: true, mustChangePassword: false };
const connected: PublicUser = { ...independent, coachId: 40 };
function result(user: PublicUser): Response { return { ok: true, status: 200, json: async () => ({ user }) } as Response; }
function Probe() {
  const { user, setUser } = useSession();
  return <><p data-testid="relationship">{`${user?.id}:${user?.coachId ?? 'none'}:${user?.coachAccess}`}</p><button onClick={() => setUser(connected)}>connect</button></>;
}
beforeEach(() => {
  window.localStorage.clear(); setToken('session-for-24'); setStoredUser(independent); setActiveProgram([]);
  mocks.loadAssigned.mockReset().mockResolvedValue(undefined); mocks.loadStored.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('relationship changes in SessionProvider', () => {
  it('ignores an older account response after a successful connection and immediately switches programme mode', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('relationship')).toHaveTextContent('24:none:true');
    fireEvent.click(screen.getByRole('button', { name: 'connect' }));
    expect(screen.getByTestId('relationship')).toHaveTextContent('24:40:true');
    expect(isProgramReadOnly()).toBe(true);
    expect(getActiveProgram()).toEqual([]);
    expect(mocks.loadAssigned).toHaveBeenCalled();
    await act(async () => { resolve(result(independent)); });
    expect(screen.getByTestId('relationship')).toHaveTextContent('24:40:true');
  });

  it('re-reads relationship changes made in another tab without switching accounts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(result(independent)).mockResolvedValueOnce(result(connected)));
    render(<SessionProvider><Probe /></SessionProvider>);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => {
      setStoredUser(connected);
      window.dispatchEvent(new StorageEvent('storage', { key: USER_KEY, newValue: JSON.stringify(connected), storageArea: window.localStorage }));
    });
    await waitFor(() => expect(screen.getByTestId('relationship')).toHaveTextContent('24:40:true'));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(isProgramReadOnly()).toBe(true);
  });
});
