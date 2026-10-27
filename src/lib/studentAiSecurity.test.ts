import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./api', () => ({
  api: mock.api,
  getStoredUser: () => ({ id: 42 }),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
import { ApiError } from './api';
import { getLocalFallbackBiometrics, getStudentBiometrics, saveLocalFallbackBiometrics, saveStudentBiometricsApi } from './studentAiBiometrics';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('meety.account-scope', 'user-9');
  mock.api.mockReset();
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

  it('caches a successful authorized response', async () => {
    const biometrics = { ...getLocalFallbackBiometrics(42), age: 28 };
    mock.api.mockResolvedValue({ biometrics });
    await expect(saveStudentBiometricsApi(42, { age: 28 })).resolves.toEqual(biometrics);
    expect(getLocalFallbackBiometrics(42).age).toBe(28);
  });
});
