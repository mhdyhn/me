import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelAssignedProgramLoad, loadAssignedProgram } from './assignedProgram';
import { getActiveProgram, getAssignedMeta, getAssignedProgramLoadState, isProgramReadOnly, setActiveProgram, setAssignedMeta, setAssignedProgram } from './programStore';

const program = { id: 'offer', version: 1, title: 'برنامه', priceTomans: 100000, updatedAt: '2026-10-28', days: [{ name: 'روز اول', exercises: [{ exerciseId: 'push-up', name: 'شنا', muscle: 'سینه', sets: 3, reps: '10', restSeconds: 60 }] }] };
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
const openTestAccess = { program, isPaid: false, isTestPurchase: true, testPurchaseExpiresAt: '2026-10-29T12:00:00Z' };
const locked = { program: { ...program, days: [] }, isPaid: false, testPurchaseAvailable: false };

beforeEach(() => {
  window.localStorage.setItem('meety.session-token', 'first-student-token');
  setAssignedMeta(null);
  setAssignedProgram([]);
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.removeItem('meety.session-token');
  setAssignedMeta(null);
  setAssignedProgram([]);
});

describe('assigned programme response ordering', () => {
  it('fails closed on a malformed response instead of showing an empty or unlocked programme', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      for (const invalid of [{}, { program, isPaid: undefined }, { program: { ...program, days: null }, isPaid: true }, { program, isPaid: false, isTestPurchase: true }]) {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(invalid)));
        await loadAssignedProgram();
        expect(getAssignedProgramLoadState()).toBe('error');
        expect(getAssignedMeta()).toBeNull();
        expect(getActiveProgram()).toEqual([]);
      }
    } finally { log.mockRestore(); }
  });

  it('ignores a late open response after a newer recheck has locked the programme', async () => {
    let resolveOld!: (value: Response) => void;
    const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(oldResponse).mockResolvedValueOnce(response(locked)));
    const oldRequest = loadAssignedProgram();
    await loadAssignedProgram();
    expect(getAssignedMeta()).toMatchObject({ isPaid: false, isTestPurchase: false });
    resolveOld(response(openTestAccess));
    await oldRequest;
    expect(getAssignedMeta()).toMatchObject({ isPaid: false, isTestPurchase: false });
    expect(getActiveProgram()).toEqual([]);
  });

  it('does not replace the personal programme with a late coach response', async () => {
    let resolveOld!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveOld = resolve; })));
    const request = loadAssignedProgram();
    cancelAssignedProgramLoad();
    setAssignedMeta(null);
    setActiveProgram([]);
    resolveOld(response(openTestAccess));
    await request;
    expect(isProgramReadOnly()).toBe(false);
    expect(getAssignedMeta()).toBeNull();
    expect(getActiveProgram()).toEqual([]);
  });

  it('does not apply a test programme response after switching sessions', async () => {
    let resolveOld!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { resolveOld = resolve; })));
    const oldRequest = loadAssignedProgram();
    window.localStorage.setItem('meety.session-token', 'other-student-token');
    resolveOld(response(openTestAccess));
    await oldRequest;
    expect(getAssignedMeta()).toBeNull();
    expect(getActiveProgram()).toEqual([]);
  });
});
