import { Link } from 'react-router-dom';
import { ChevronLeft, Wand2 } from 'lucide-react';
import { SectionHeading } from '../components/SectionHeading';
import { PremiumGate } from '../components/PremiumGate';
import { SuggestedProgram } from '../components/SuggestedProgram';
import { useSession } from '../context/SessionContext';

/**
 * The suggested programme for the student who trains on their own.
 *
 * The coach's programme always comes first; this page is the answer for the independent
 * student, and it is part of the smart features the monthly subscription opens.
 */
export function ProgramSuggested() {
  const { user } = useSession();
  const independent = user?.role === 'student' && (user.coachId === null || user.personalProgramMode === true);
  const coached = user?.role === 'student' && !independent;

  return (
    <div className="page-stack">
      <SectionHeading
        eyebrow="برنامهٔ پیشنهادی"
        title="برنامه‌ای که به شرایط تو می‌خورد."
        description="پنج پرسش کوتاه: هدف، سطح، روزهای تمرین، امکانات و محدودیت بدن. میتی بر پایهٔ جواب‌ها برنامه را می‌چیند و حجم و حرکت‌ها را با شرایط تو هماهنگ می‌کند."
      />

      {coached && (
        <div className="panel-card" style={{ display: 'grid', gap: 10 }}>
          <strong>برنامهٔ فعلی شما را مربی تعیین کرده است.</strong>
          <p className="account-muted" style={{ margin: 0 }}>
            برنامهٔ پیشنهادی برای وقتی است که خودتان تمرین می‌کنید. اگر می‌خواهید برنامهٔ مربی را کنار بگذارید و برنامهٔ شخصی داشته باشید، از تنظیمات حساب آن را فعال کنید.
          </p>
          <Link to="/settings" className="button button--ghost button--small" style={{ justifySelf: 'start' }}>
            رفتن به تنظیمات حساب <ChevronLeft size={15} />
          </Link>
        </div>
      )}

      {!coached && (
        <PremiumGate
          feature="برنامهٔ پیشنهادی"
          title="برنامهٔ پیشنهادی برای شاگرد مستقل"
          description="برنامهٔ پیشنهادی، بخشی از امکانات هوشمند میتی است: با پاسخ به چند پرسش کوتاه، برنامه‌ای می‌گیرید که با سطح، امکانات و محدودیت بدنی شما جور است."
        >
          <div className="panel-card">
            <SuggestedProgram />
          </div>
        </PremiumGate>
      )}

      {!coached && (
        <p className="account-muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Wand2 size={14} /> بعد از فعال‌کردن برنامه، از صفحهٔ <Link to="/program">برنامه</Link> می‌توانید روزها و حرکت‌ها را ببینید یا ویرایش کنید.
        </p>
      )}
    </div>
  );
}
