import { useEffect, useState } from 'react';
import { CheckCircle2, Link as LinkIcon, RefreshCw, ShieldOff } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { faNumber, formatDateTime } from '../../lib/format';
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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setRefreshing(true);
    setError('');
    setData(null);
    api<ProfileResponse>('GET', `/students/${studentId}/profile`)
      .then((result) => { if (active) setData(result); })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof ApiError ? caught.message : 'پروفایل شاگرد بارگذاری نشد. اتصال را بررسی و دوباره تلاش کنید.');
      })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [studentId, refreshKey]);

  return (
    <PanelPage title={data ? `پروفایل ${data.studentName}` : 'پروفایل شاگرد'}>
      {error && <div className="student-profile-load-error" role="alert"><p>{error}</p><button className="button button--ghost" type="button" onClick={() => setRefreshKey((key) => key + 1)}>تلاش دوباره</button></div>}
      {!data && !error && <p className="account-muted">در حال بارگذاری پروفایل…</p>}
      {data && (
        <>
          <div className={`student-profile-sharing-status${data.shared ? ' is-shared' : ' is-private'}`} role="status">
            <div className="student-profile-sharing-status__label">
              {data.shared ? <CheckCircle2 size={17} /> : <ShieldOff size={17} />}
              <strong>{data.shared ? 'اشتراک پروفایل فعال است' : 'اشتراک پروفایل خاموش است'}</strong>
            </div>
            <div className="student-profile-sharing-status__detail">
              {data.shared
                ? data.updatedAt ? `آخرین به‌روزرسانی: ${formatDateTime(data.updatedAt)}` : 'پروفایل برای مربی قابل مشاهده است.'
                : 'شاگرد می‌تواند وضعیت اشتراک را از تنظیمات حساب مدیریت کند.'}
              <button className="student-profile-refresh" type="button" onClick={() => setRefreshKey((key) => key + 1)} disabled={refreshing} aria-label="تازه‌سازی پروفایل شاگرد">
                <RefreshCw size={15} className={refreshing ? 'is-spinning' : ''} />
                {refreshing ? 'در حال به‌روزرسانی…' : 'تازه‌سازی'}
              </button>
            </div>
          </div>
          {data.shared && data.profile ? (
            <>
              <div className="student-profile-grid">
                <ProfileItem label="سن" value={`${faNumber(data.profile.age)} سال`} />
                <ProfileItem label="جنسیت" value={data.profile.sex || 'ثبت نشده'} />
                <ProfileItem label="قد" value={`${faNumber(data.profile.heightCm)} سانتی‌متر`} />
                <ProfileItem label="وزن پروفایل" value={`${faNumber(data.profile.weightKg)} کیلوگرم`} />
                <ProfileItem label="هدف اصلی" value={data.profile.primaryGoal} />
                <ProfileItem label="هدف تکمیلی" value={data.profile.secondaryGoal || 'ثبت نشده'} />
                <ProfileItem label="سابقهٔ تمرین" value={data.profile.trainingExperience || 'ثبت نشده'} />
                <ProfileItem label="روزهای تمرین در هفته" value={data.profile.trainingDays ? faNumber(data.profile.trainingDays) : 'ثبت نشده'} />
                <ProfileItem label="زمان معمول جلسه" value={data.profile.sessionMinutes ? `${faNumber(data.profile.sessionMinutes)} دقیقه` : 'ثبت نشده'} />
                <ProfileItem label="فعالیت روزانه" value={data.profile.dailyActivity || 'ثبت نشده'} />
                <ProfileItem label="میزان خواب" value={data.profile.sleepHours || 'ثبت نشده'} />
                <ProfileItem label="تجهیزات" value={data.profile.equipment || 'ثبت نشده'} />
                <ProfileItem label="آسیب‌دیدگی یا محدودیت" value={data.profile.injuries || 'ثبت نشده'} wide />
              </div>
              <p className="student-profile-note"><LinkIcon size={14} /> اطلاعات با حساب مربی شاگرد همگام شده است؛ برای دیدن تغییرات تازه، «تازه‌سازی» را بزنید. این پروفایل جایگزین تشخیص یا توصیهٔ پزشکی نیست.</p>
            </>
          ) : !data.shared ? (
            <div className="student-profile-private">
              <p>در حال حاضر اطلاعات پروفایل برای مربی نمایش داده نمی‌شود.</p>
              <Link className="button button--ghost" to={`/coach/students/${studentId}/chat`}>پیام به شاگرد</Link>
            </div>
          ) : (
            <p className="account-muted">اشتراک روشن است، اما هنوز پروفایلی برای نمایش ثبت نشده است.</p>
          )}
        </>
      )}
    </PanelPage>
  );
}

function ProfileItem({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return <div className={`student-profile-item${wide ? ' student-profile-item--wide' : ''}`}><span>{label}</span><strong>{value}</strong></div>;
}
