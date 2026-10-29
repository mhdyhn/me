import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ api: vi.fn(), user: { id: 42, coachId: 10, coachAccess: true, personalProgramMode: false } }));
vi.mock('./api', () => ({
  api: mock.api,
  getStoredUser: () => mock.user,
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
import { ApiError } from './api';
import { getLocalFallbackBiometrics, getMyAiSettings, getStudentBiometrics, saveLocalFallbackBiometrics, saveStudentBiometricsApi } from './studentAiBiometrics';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('meety.account-scope', 'user-9');
  mock.api.mockReset();
  mock.user = { id: 42, coachId: 10, coachAccess: true, personalProgramMode: false };
});

describe('biometric permissions and save feedback', () => {
  it('does not expose cached data when a coach no longer has access', async () => {
    saveLocalFallbackBiometrics({ ...getLocalFallbackBiometrics(42), limitations: 'محرمانه' });
    mock.api.mockRejectedValue(new ApiError(404, 'شاگرد پیدا نشد.'));
    await expect(getStudentBiometrics(42)).rejects.toMatchObject({ status: 404 });
  });

  it('does not pretend an offline or rejected update was saved on the server', async () => {
    mock.api.mockRejectedValue(new ApiError(0, 'اتصال برقرار نشد.'));
    await expect(saveStudentBiometricsApi(42, { limitations: 'تغییر تازه' })).rejects.toMatchObject({ status: 0 });
    expect(getLocalFallbackBiometrics(42).limitations).toBe('');
  });

  it('uses only the current relationship cache when the student is offline', async () => {
    const previous = { ...getLocalFallbackBiometrics(42), limitations: 'محدودیت مربی قبلی' };
    mock.api.mockResolvedValueOnce({ biometrics: previous });
    expect((await getMyAiSettings()).limitations).toBe('محدودیت مربی قبلی');
    mock.api.mockRejectedValue(new ApiError(0, 'اتصال برقرار نشد.'));
    expect((await getMyAiSettings()).limitations).toBe('محدودیت مربی قبلی');
    mock.user.coachId = 11;
    expect((await getMyAiSettings()).limitations).toBe('');
    mock.user.coachId = 10;
    mock.user.coachAccess = false;
    expect((await getMyAiSettings()).limitations).toBe('');
    mock.user.personalProgramMode = true;
    expect((await getMyAiSettings()).limitations).toBe('');
    mock.api.mockRejectedValue(new ApiError(403, 'دسترسی ندارید.'));
    await expect(getMyAiSettings()).rejects.toMatchObject({ status: 403 });
  });

  it('caches a successful authorized response', async () => {
    const biometrics = { ...getLocalFallbackBiometrics(42), age: 28 };
    mock.api.mockResolvedValue({ biometrics });
    await expect(saveStudentBiometricsApi(42, { age: 28 })).resolves.toEqual(biometrics);
    expect(getLocalFallbackBiometrics(42).age).toBe(28);
  });
});
