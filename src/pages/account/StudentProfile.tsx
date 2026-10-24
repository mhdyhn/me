import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { faNumber, formatDate } from '../../lib/format';
import type { UserProfile } from '../../types';
import { PanelPage, RequireRole } from './AccountShell';

interface ProfileResponse {
  studentName: string;
  profile: UserProfile | null;
  updatedAt: string | null;
  shared: boolean;
}

export function StudentProfile() {
  return <RequireRole roles={['coach']}><StudentProfileScreen /></RequireRole>;
}

function StudentProfileScreen() {
  const { studentId } = useParams();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<ProfileResponse>('GET', `/students/${studentId}/profile`)
      .then((result) => { if (active) setData(result); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'پروفایل شاگرد بارگذاری نشد.'); });
    return () => { active = false; };
  }, [studentId]);

  return (
    <PanelPage title={data ? `پروفایل ${data.studentName}` : 'پروفایل شاگرد'}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!data && !error && <p className="account-muted">در حال بارگذاری…</p>}
      {data && !data.shared && (
        <div className="student-profile-private" role="status">
          <h3>پروفایل با شما به‌اشتراک گذاشته نشده است.</h3>
          <p>پس از تکمیل پروفایل، شاگرد می‌تواند نمایش آن را از تنظیمات مدیریت یا متوقف کند.</p>
          <Link className="button button--ghost" to={`/coach/students/${studentId}/chat`}>پیام به شاگرد</Link>
        </div>
      )}
      {data?.profile && (
        <>
          <p className="account-muted">این اطلاعات را شاگرد با اجازهٔ خودش به اشتراک گذاشته است{data.updatedAt ? ` · به‌روزرسانی ${formatDate(data.updatedAt)}` : ''}.</p>
          <div className="student-profile-grid">
            <ProfileItem label="سن" value={`${faNumber(data.profile.age)} سال`} />
            <ProfileItem label="جنسیت" value={data.profile.sex || 'ثبت نشده'} />
            <ProfileItem label="قد" value={`${faNumber(data.profile.heightCm)} سانتی‌متر`} />
            <ProfileItem label="وزن پروفایل" value={`${faNumber(data.profile.weightKg)} کیلوگرم`} />
            <ProfileItem label="هدف اصلی" value={data.profile.primaryGoal} />
            <ProfileItem label="هدف تکمیلی" value={data.profile.secondaryGoal || 'ثبت نشده'} />
            <ProfileItem label="سابقهٔ تمرین" value={data.profile.trainingExperience || 'ثبت نشده'} />
            <ProfileItem label="روزهای تمرین در هفته" value={faNumber(data.profile.trainingDays)} />
            <ProfileItem label="زمان معمول جلسه" value={`${faNumber(data.profile.sessionMinutes)} دقیقه`} />
            <ProfileItem label="فعالیت روزانه" value={data.profile.dailyActivity || 'ثبت نشده'} />
            <ProfileItem label="میزان خواب" value={data.profile.sleepHours || 'ثبت نشده'} />
            <ProfileItem label="تجهیزات" value={data.profile.equipment || 'ثبت نشده'} />
            <ProfileItem label="آسیب‌دیدگی یا محدودیت" value={data.profile.injuries || 'ثبت نشده'} wide />
          </div>
          <p className="student-profile-note">پروفایل برای شناخت شرایط تمرین است و جایگزین تشخیص یا توصیهٔ پزشکی نیست.</p>
        </>
      )}
    </PanelPage>
  );
}

function ProfileItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`student-profile-item${wide ? ' student-profile-item--wide' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}
