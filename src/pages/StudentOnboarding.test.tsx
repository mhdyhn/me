import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { blankProfile } from '../data/profile';
import type { UserProfile } from '../types';

const saveProfile = vi.fn<(_: UserProfile) => Promise<void>>();
vi.mock('../context/GymProvider', () => ({
  useGym: () => ({ profile: blankProfile, saveProfile }),
}));

import { StudentOnboarding } from './StudentOnboarding';

describe('student onboarding', () => {
  beforeEach(() => {
    saveProfile.mockReset().mockResolvedValue(undefined);
  });

  it('collects the existing profile data over three steps and saves it', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<StudentOnboarding onDismiss={onDismiss} />);

    await user.type(screen.getByLabelText('سن'), '28');
    await user.selectOptions(screen.getByLabelText('جنسیت (اختیاری)'), 'زن');
    await user.type(screen.getByLabelText('قد · سانتی‌متر'), '168');
    await user.type(screen.getByLabelText('وزن فعلی · کیلوگرم'), '64');
    await user.selectOptions(screen.getByLabelText('هدف اصلی'), 'کاهش چربی');
    await user.click(screen.getByRole('button', { name: /ادامه/ }));

    await user.type(screen.getByLabelText('سابقهٔ تمرین'), 'مبتدی');
    await user.type(screen.getByLabelText('روز تمرین در هفته'), '3');
    await user.type(screen.getByLabelText('زمان هر جلسه · دقیقه'), '45');
    await user.selectOptions(screen.getByLabelText('تجهیزات در دسترس'), 'دمبل و تجهیزات محدود');
    await user.click(screen.getByRole('button', { name: /ادامه/ }));

    await user.selectOptions(screen.getByLabelText('میزان فعالیت روزانه'), 'فعالیت سبک');
    await user.type(screen.getByLabelText('میزان خواب معمول'), '۷ ساعت');
    await user.type(screen.getByLabelText('آسیب‌دیدگی یا محدودیت · اختیاری'), 'بدون محدودیت');
    await user.click(screen.getByRole('button', { name: /ذخیره و ادامه/ }));

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
      age: 28,
      sex: 'زن',
      heightCm: 168,
      weightKg: 64,
      primaryGoal: 'کاهش چربی',
      trainingDays: 3,
      sessionMinutes: 45,
      equipment: 'دمبل و تجهیزات محدود',
      dailyActivity: 'فعالیت سبک',
      sleepHours: '۷ ساعت',
      injuries: 'بدون محدودیت',
    }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('lets a student defer the setup without saving a partial profile', async () => {
    const onDismiss = vi.fn();
    render(<StudentOnboarding onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'بعداً تکمیل می‌کنم' }));
    expect(saveProfile).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
