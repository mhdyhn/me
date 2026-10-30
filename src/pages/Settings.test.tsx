import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserProfile } from '../types';

const mocks = vi.hoisted(() => ({
  api: vi.fn(), saveProfile: vi.fn(), loading: false, user: { id: 12, role: 'student', coachId: 4 } as { id: number; role: string; coachId: number | null },
  profile: { age: 28, sex: 'مرد', heightCm: 180, weightKg: 80, primaryGoal: 'قدرت', secondaryGoal: '', trainingDays: 4, sessionMinutes: 60, trainingExperience: 'مبتدی', sleepHours: '۷ ساعت', dailyActivity: 'متوسط', stressLevel: 3, injuries: '', equipment: '', workingWeightReferences: [] } as UserProfile,
  sessions: [] as unknown[], bodyweights: [] as unknown[], nutritionDays: [] as unknown[], nutritionGoals: {},
}));
vi.mock('../lib/api', () => ({ api: mocks.api, ApiError: class ApiError extends Error {} }));
vi.mock('../context/GymProvider', () => ({
  useGym: () => ({
    profile: mocks.profile, loading: mocks.loading,
    sessions: mocks.sessions, bodyweights: mocks.bodyweights, nutritionDays: mocks.nutritionDays, nutritionGoals: mocks.nutritionGoals, saveProfile: mocks.saveProfile,
  }),
}));
vi.mock('../context/SessionContext', () => ({ useSession: () => ({ user: mocks.user }) }));

import { Settings } from './Settings';
import { blankProfile } from '../data/profile';
import { sampleProfile } from '../../tests/fixtures/profile';

describe('settings profile sharing status', () => {
  beforeEach(() => {
    mocks.api.mockReset();
    mocks.saveProfile.mockReset();
    mocks.loading = false;
    mocks.user = { id: 12, role: 'student', coachId: 4 };
    mocks.profile = structuredClone(sampleProfile);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it.each(['student', 'coach', 'admin'])('shows the simple signature for %s without a visible device revision', async (role) => {
    mocks.user = { id: 12, role, coachId: role === 'student' ? 4 : null };
    mocks.api.mockResolvedValue({ stored: null, sharingVersion: 0 });
    render(<Settings />);
    const signature = screen.getByText('mhdy').closest('.settings-signature');
    expect(signature).toHaveTextContent('طراحی شده توسط mhdy');
    expect(signature).toHaveAttribute('data-web-revision');
    expect(screen.queryByText(/با مهرِ مهدی|طراحی رابط و تجربهٔ کاربری|شناسهٔ نسخهٔ رابط/)).not.toBeInTheDocument();
    if (role === 'student') await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
  });


  it.each(['student', 'coach', 'admin'])('starts %s with blank fields and no legacy import button', async (role) => {
    mocks.user = { id: 12, role, coachId: role === 'student' ? 4 : null } as typeof mocks.user;
    mocks.profile = { ...blankProfile } as typeof mocks.profile;
    mocks.api.mockResolvedValue({ stored: null, sharingVersion: 0 });
    render(<Settings />);
    expect(screen.getByLabelText('سن')).toHaveValue(null);
    expect(screen.getByLabelText(/قد/)).toHaveValue(null);
    expect(screen.getByLabelText(/وزن پروفایل/)).toHaveValue(null);
    expect(screen.getByLabelText('جنسیت')).toHaveValue('');
    expect(screen.getByLabelText('هدف اصلی')).toHaveValue('');
    expect(screen.getByLabelText('روزهای تمرین در هفته')).toHaveValue(null);
    expect(screen.getByLabelText(/حداکثر زمان جلسه/)).toHaveValue(null);
    expect(screen.queryByText('وزنه‌های کاری گزارش‌شده')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /انتقال.*قدیمی/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/شناسهٔ نسخهٔ رابط/)).not.toBeInTheDocument();
    if (role === 'student') await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
  });

  it.each(['student', 'coach', 'admin'])('%s can add, edit, and delete their own working weights, including zero', async (role) => {
    mocks.user = { id: 12, role, coachId: role === 'student' ? 4 : null };
    mocks.profile = structuredClone(blankProfile);
    mocks.api.mockImplementation(async (method: string) => method === 'GET' ? { stored: null, sharingVersion: 0 } : { shareWithCoach: false, sharingVersion: 1 });
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    if (role === 'student') await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'افزودن وزنهٔ کاری' }));
    fireEvent.change(screen.getByLabelText('نام حرکت وزنهٔ ۱'), { target: { value: 'حرکت خودم' } });
    fireEvent.change(screen.getByLabelText('مقدار وزنهٔ ۱ به کیلوگرم'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('یادداشت وزنهٔ ۱'), { target: { value: 'یادداشت خودم' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenLastCalledWith(expect.objectContaining({ workingWeightReferences: [{ label: 'حرکت خودم', weightKg: 0, note: 'یادداشت خودم' }] }), expect.anything()));
    fireEvent.change(screen.getByLabelText('مقدار وزنهٔ ۱ به کیلوگرم'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenLastCalledWith(expect.objectContaining({ workingWeightReferences: [{ label: 'حرکت خودم', weightKg: 12.5, note: 'یادداشت خودم' }] }), expect.anything()));
    fireEvent.click(screen.getByLabelText('حذف وزنهٔ ۱'));
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenLastCalledWith(expect.objectContaining({ workingWeightReferences: [] }), expect.anything()));
  });

  it('does not accept a blank weight and keeps all 25 saved references', async () => {
    const references = Array.from({ length: 25 }, (_, index) => ({ label: `حرکت ${index}`, weightKg: index, note: '' }));
    mocks.user = { id: 12, role: 'admin', coachId: null };
    mocks.profile = { ...blankProfile, workingWeightReferences: references };
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    expect(screen.getAllByLabelText(/مقدار وزنهٔ .* به کیلوگرم/)).toHaveLength(25);
    fireEvent.change(screen.getByLabelText('مقدار وزنهٔ ۱ به کیلوگرم'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(await screen.findByText(/برای هر وزنه نام حرکت و عددی بین صفر/)).toBeInTheDocument();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('مقدار وزنهٔ ۱ به کیلوگرم'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ workingWeightReferences: references }), expect.anything()));
  });

  it('revokes sharing before validating or saving even when the previously loaded state was off', async () => {
    mocks.api.mockResolvedValueOnce({ stored: null, sharingVersion: 0 }).mockResolvedValueOnce({ shareWithCoach: false, sharingVersion: 1 });
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('سن'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(await screen.findByText(/دسترسی پروفایل قطع شد/)).toBeInTheDocument();
    expect(mocks.api).toHaveBeenLastCalledWith('POST', '/me/profile/sharing', { accountId: 12, shareWithCoach: false });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it('keeps information actually saved in the account visible and editable', async () => {
    mocks.profile = { ...blankProfile, age: 37, sex: 'زن', heightCm: 165, weightKg: 70, primaryGoal: 'هدف خودم' } as typeof mocks.profile;
    mocks.api.mockResolvedValue({ stored: null, sharingVersion: 0 });
    render(<Settings />);
    expect(screen.getByLabelText('سن')).toHaveValue(37);
    expect(screen.getByLabelText('جنسیت')).toHaveValue('زن');
    expect(screen.getByLabelText('هدف اصلی')).toHaveValue('هدف خودم');
    expect(screen.queryByRole('button', { name: /انتقال.*قدیمی/ })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
  });

  it('can share a filled profile without inventing optional days or session duration', async () => {
    mocks.profile = { ...blankProfile, age: 37, heightCm: 165, weightKg: 70, primaryGoal: 'هدف خودم' } as typeof mocks.profile;
    mocks.api.mockResolvedValueOnce({ stored: null, sharingVersion: 0 }).mockResolvedValueOnce({ stored: { shareWithCoach: true } });
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    await waitFor(() => expect(checkbox).toBeEnabled());
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('PUT', '/me/profile', expect.objectContaining({
      shareWithCoach: true, profile: expect.objectContaining({ trainingDays: 0, sessionMinutes: 0 }),
    })));
  });

  it('keeps sharing controls disabled after a load error and retries successfully', async () => {
    mocks.api.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      stored: { profile: {}, shareWithCoach: true }, sharingVersion: 0,
    });
    render(<Settings />);

    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    expect(await screen.findByText('وضعیت همگام‌سازی با سرور بارگذاری نشد.')).toBeInTheDocument();
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری' }));
    await waitFor(() => expect(checkbox).toBeEnabled());
    expect(checkbox).toBeChecked();
    expect(mocks.api).toHaveBeenCalledTimes(2);
  });
  it('does not claim success when local profile persistence fails', async () => {
    mocks.api.mockResolvedValueOnce({ stored: null, sharingVersion: 0 }).mockResolvedValueOnce({ shareWithCoach: false, sharingVersion: 1 });
    mocks.saveProfile.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(await screen.findByText(/پروفایل در حافظهٔ دستگاه ذخیره نشد/)).toBeInTheDocument();
    expect(screen.queryByText('ذخیره شد')).not.toBeInTheDocument();
  });


  it('waits for local data before allowing a profile edit', async () => {
    mocks.loading = true;
    mocks.api.mockResolvedValue({ stored: null, sharingVersion: 0 });
    const view = render(<Settings />);
    expect(screen.getByRole('status')).toHaveTextContent('در حال آماده‌سازی');
    expect(screen.queryByLabelText('سن')).not.toBeInTheDocument();
    mocks.loading = false;
    view.rerender(<Settings />);
    expect(screen.getByLabelText('سن')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
  });

  it('keeps the draft unsaved while coach sharing status is unavailable', async () => {
    mocks.api.mockRejectedValue(new Error('offline'));
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    await screen.findByText('وضعیت همگام‌سازی با سرور بارگذاری نشد.');
    fireEvent.change(screen.getByLabelText('سن'), { target: { value: '29' } });
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(screen.getByText(/ابتدا وضعیت دسترسی مربی را بررسی کن/)).toBeInTheDocument();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    expect(screen.getByLabelText('سن')).toHaveValue(29);
    expect(mocks.api).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeDisabled();
  });

  it('preserves an unsaved draft when a newer profile arrives and requires an explicit choice', async () => {
    mocks.api.mockImplementation(async (method: string) => method === 'GET' ? { stored: null, sharingVersion: 0 } : { shareWithCoach: false, sharingVersion: 1 });
    mocks.saveProfile.mockResolvedValue(true);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const view = render(<Settings />);
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('سن'), { target: { value: '29' } });
    mocks.profile = { ...mocks.profile, age: 30 };
    view.rerender(<Settings />);
    expect(screen.getByLabelText('سن')).toHaveValue(29);
    expect(screen.getByText('این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'نگه‌داشتن پیش‌نویس من' }));
    await waitFor(() => expect(screen.queryByText('این اطلاعات در دستگاه یا زبانهٔ دیگری تغییر کرده است.')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    await waitFor(() => expect(mocks.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ age: 29 }), expect.objectContaining({ age: 30 })));
  });

  it('does not save or sync the new profile when revoking sharing fails', async () => {
    mocks.api.mockResolvedValueOnce({ stored: { profile: {}, shareWithCoach: true }, sharingVersion: 0 }).mockRejectedValueOnce(new Error('offline'));
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    await waitFor(() => expect(checkbox).toBeChecked());
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(await screen.findByText(/مربی ممکن است همچنان دسترسی داشته باشد/)).toBeInTheDocument();
    expect(mocks.api).toHaveBeenLastCalledWith('POST', '/me/profile/sharing', { accountId: 12, shareWithCoach: false });
    expect(mocks.saveProfile).not.toHaveBeenCalled();
  });

  it('does not assume consent is off when the profile response is malformed', async () => {
    mocks.api.mockResolvedValueOnce({}).mockResolvedValueOnce({ stored: { profile: {}, shareWithCoach: true }, sharingVersion: 0 });
    render(<Settings />);
    expect(await screen.findByText('وضعیت همگام‌سازی با سرور بارگذاری نشد.')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    expect(checkbox).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره برای بارگذاری' }));
    await waitFor(() => expect(checkbox).toBeChecked());
  });

  it('warns instead of claiming privacy when the revocation response is malformed', async () => {
    mocks.api.mockResolvedValueOnce({ stored: { profile: {}, shareWithCoach: true }, sharingVersion: 0 }).mockResolvedValueOnce({});
    mocks.saveProfile.mockResolvedValue(true);
    render(<Settings />);
    const checkbox = screen.getByRole('checkbox', { name: /نمایش پروفایل به مربی/ });
    await waitFor(() => expect(checkbox).toBeChecked());
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ پروفایل/ }));
    expect(await screen.findByText(/مربی ممکن است همچنان دسترسی داشته باشد/)).toBeInTheDocument();
    expect(screen.queryByText('ذخیره شد')).not.toBeInTheDocument();
  });

  it('marks an empty profile as not registered and offers no delete action', async () => {
    mocks.user = { id: 12, role: 'student', coachId: 4 };
    mocks.profile = { ...blankProfile } as typeof mocks.profile;
    mocks.api.mockResolvedValue({ stored: null, sharingVersion: 0 });
    render(<Settings />);
    expect(screen.getByText(/ثبت نشده/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /پاک‌کردن پروفایل ذخیره‌شده/ })).not.toBeInTheDocument();
  });

  it('lets the account owner delete a stored profile that is not theirs', async () => {
    mocks.user = { id: 12, role: 'student', coachId: 4 };
    mocks.profile = structuredClone(sampleProfile);
    mocks.api.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET') return { stored: null, sharingVersion: 0 };
      if (path === '/me/profile/purge') return { cleared: true, version: 4 };
      return {};
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /پاک‌کردن پروفایل ذخیره‌شده/ }));
    await waitFor(() => expect(mocks.api).toHaveBeenCalledWith('POST', '/me/profile/purge', { accountId: 12 }));
    expect(await screen.findByText(/پروفایل ذخیره‌شده پاک شد/)).toBeInTheDocument();
  });

  it('keeps the stored profile when the delete request fails', async () => {
    mocks.user = { id: 12, role: 'student', coachId: 4 };
    mocks.profile = structuredClone(sampleProfile);
    mocks.api.mockImplementation(async (method: string) => {
      if (method === 'GET') return { stored: null, sharingVersion: 0 };
      throw new Error('offline');
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: /پاک‌کردن پروفایل ذخیره‌شده/ }));
    expect(await screen.findByText(/پروفایل ذخیره‌شده پاک نشد/)).toBeInTheDocument();
  });

});
