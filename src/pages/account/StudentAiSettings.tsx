import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Dumbbell,
  HeartPulse,
  Save,
  Search,
  Sparkles,
} from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { faNumber } from '../../lib/format';
import {
  AI_MODULES_INFO,
  ALL_AI_MODULES,
  calculateHeartRateZones,
  calculateMaxHeartRate,
  getStudentBiometrics,
  saveStudentBiometricsApi,
  type AiModuleKey,
  type HeartRateZone,
  type MaxHrMethod,
  type StudentBiometricsData,
} from '../../lib/studentAiBiometrics';
import { runStudentDiagnostic, type DiagnosticAuditReport } from '../../lib/studentDiagnostic';
import { PanelPage, RequireRole } from './AccountShell';

export function StudentAiSettings() {
  return (
    <RequireRole roles={['coach', 'admin']}>
      <StudentAiSettingsScreen />
    </RequireRole>
  );
}

function StudentAiSettingsScreen() {
  const { studentId } = useParams<{ studentId: string }>();
  const id = Number(studentId);

  const [studentName, setStudentName] = useState<string>('شاگرد');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [enabledModules, setEnabledModules] = useState<AiModuleKey[]>([...ALL_AI_MODULES]);
  const [age, setAge] = useState<string>('');
  const [restingHr, setRestingHr] = useState<string>('');
  const [maxHrMethod, setMaxHrMethod] = useState<MaxHrMethod>('tanaka');
  const [customMaxHr, setCustomMaxHr] = useState<string>('');
  const [limitations, setLimitations] = useState<string>('');

  // Diagnostic engine state
  const [diagnosticReport, setDiagnosticReport] = useState<DiagnosticAuditReport | null>(null);
  const [runningDiagnostic, setRunningDiagnostic] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const data = await getStudentBiometrics(id);
        if (!mounted) return;
        setEnabledModules(data.enabledModules || [...ALL_AI_MODULES]);
        setAge(data.age ? String(data.age) : '');
        setRestingHr(data.restingHr ? String(data.restingHr) : '');
        setMaxHrMethod(data.maxHrMethod || 'tanaka');
        setCustomMaxHr(data.maxHrMethod === 'custom' && data.maxHr ? String(data.maxHr) : '');
        setLimitations(data.limitations || '');

        // Fetch student name, sessions, and nutrition targets for diagnostic
        try {
          const [sessionsRes, nutritionRes] = await Promise.all([
            api<{ studentName: string; sessions: any[] }>('GET', `/students/${id}/sessions`),
            api<{ plan?: { targets?: { kcal?: number | null; proteinG?: number | null } } }>('GET', `/students/${id}/nutrition`).catch(() => ({ plan: undefined })),
          ]);
          if (mounted) {
            setStudentName(sessionsRes.studentName || 'شاگرد');
            if (sessionsRes.sessions) {
              const report = runStudentDiagnostic(sessionsRes.sessions, data, {
                nutritionTargets: nutritionRes.plan?.targets,
              });
              setDiagnosticReport(report);
            }
          }
        } catch {
          // If sessions fail, still continue
        }
      } catch (caught) {
        if (mounted) setErrorMessage(caught instanceof ApiError ? caught.message : 'بارگذاری تنظیمات انجام نشد.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadData();
    return () => {
      mounted = false;
    };
  }, [id]);

  const numAge = age ? parseInt(age, 10) : null;
  const numRhr = restingHr ? parseInt(restingHr, 10) : null;
  const numCustomMax = customMaxHr ? parseInt(customMaxHr, 10) : null;

  const calculatedMax = calculateMaxHeartRate(numAge, maxHrMethod, numCustomMax);
  const liveZones: HeartRateZone[] = calculateHeartRateZones(calculatedMax, numRhr);

  function toggleModule(key: AiModuleKey) {
    setEnabledModules((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function handleSave() {
    setSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const payload = {
        enabledModules,
        age: numAge,
        restingHr: numRhr,
        maxHrMethod,
        maxHr: maxHrMethod === 'custom' ? numCustomMax : calculatedMax,
        limitations: limitations.trim(),
      };
      await saveStudentBiometricsApi(id, payload);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (caught) {
      setErrorMessage(caught instanceof ApiError ? caught.message : 'خطا در ذخیره‌سازی تنظیمات.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunDiagnostic() {
    setRunningDiagnostic(true);
    try {
      const [sessionsRes, nutritionRes] = await Promise.all([
        api<{ studentName: string; sessions: any[] }>('GET', `/students/${id}/sessions`),
        api<{ plan?: { targets?: { kcal?: number | null; proteinG?: number | null } } }>('GET', `/students/${id}/nutrition`).catch(() => ({ plan: undefined })),
      ]);
      const currentBio: StudentBiometricsData = {
        studentId: id,
        enabledModules,
        age: numAge,
        restingHr: numRhr,
        maxHr: calculatedMax,
        maxHrMethod,
        limitations,
        contraindicatedMovements: [],
        zones: liveZones,
        updatedAt: new Date().toISOString(),
      };
      const report = runStudentDiagnostic(sessionsRes.sessions || [], currentBio, {
        nutritionTargets: nutritionRes.plan?.targets,
      });
      setDiagnosticReport(report);
    } catch {
      setErrorMessage('اجرای عیب‌یابی با خطا مواجه شد.');
    } finally {
      setRunningDiagnostic(false);
    }
  }

  if (loading) {
    return (
      <PanelPage title="تنظیمات هوش مصنوعی و بیومتریک">
        <p className="account-muted">در حال بارگذاری اطلاعات شاگرد…</p>
      </PanelPage>
    );
  }

  return (
    <PanelPage title={`هوش مصنوعی، بیومتریک و عیب‌یابی: ${studentName}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Link to="/coach" className="button button--ghost button--small">
          <ArrowLeft size={16} /> بازگشت به شاگردها
        </Link>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/coach/students/${id}/progress`} className="button button--ghost button--small">
            <Activity size={15} /> تاریخچه تمرینات
          </Link>
          <Link to={`/coach/students/${id}/program`} className="button button--ghost button--small">
            <Dumbbell size={15} /> برنامه تمرینی
          </Link>
        </div>
      </div>

      {errorMessage && (
        <div className="login-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={16} /> {errorMessage}
        </div>
      )}

      {saveSuccess && (
        <div className="badge badge--success" style={{ width: '100%', padding: '12px', marginBottom: 16, fontSize: '14px' }}>
          <CheckCircle2 size={18} /> تغییرات و تنظیمات بیومتریک شاگرد با موفقیت ذخیره شد.
        </div>
      )}

      {/* SECTION 1: Coach-controlled AI Modules for this Student */}
      <section className="panel-card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Sparkles size={20} className="icon-accent" />
          <h3 style={{ margin: 0 }}>کنترل ماژول‌های هوش مصنوعی شاگرد</h3>
        </div>
        <p className="muted small-text" style={{ marginBottom: 16 }}>
          مشخص کنید شاگرد در پنل اختصاصی خود به کدام ماژول‌های هوش و ریکاوری دسترسی داشته باشد. ماژول‌های غیرفعال‌شده در صفحهٔ اصلی و مرکز هوش شاگرد پنهان می‌شوند.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {ALL_AI_MODULES.map((key) => {
            const info = AI_MODULES_INFO[key];
            const isEnabled = enabledModules.includes(key);
            return (
              <div
                key={key}
                onClick={() => toggleModule(key)}
                style={{
                  border: `1.5px solid ${isEnabled ? info.color : 'var(--color-border)'}`,
                  borderRadius: 12,
                  padding: '14px',
                  backgroundColor: isEnabled ? `${info.color}0a` : 'var(--color-surface-elevated)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <strong style={{ display: 'block', fontSize: '15px' }}>{info.title}</strong>
                    <span className="muted text-xs">{info.subtitle}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => {}}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: info.color }}
                  />
                </div>
                <p className="muted" style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
                  {info.description}
                </p>
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: isEnabled ? `${info.color}20` : '#2d374830',
                      color: isEnabled ? info.color : 'var(--color-text-muted)',
                      fontSize: '11px',
                    }}
                  >
                    {isEnabled ? 'فعال برای شاگرد' : 'غیرفعال'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Biometrics, Max Heart Rate, Zones & Medical Restrictions */}
      <section className="panel-card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <HeartPulse size={20} style={{ color: '#ef4444' }} />
          <h3 style={{ margin: 0 }}>پایش بیومتریک، ضربان بیشینه و زون‌های قلبی</h3>
        </div>
        <p className="muted small-text" style={{ marginBottom: 16 }}>
          محاسبه خودکار حداکثر ضربان قلب (HR Max) و تفکیک زون‌های تمرینی ۵ گانه بر اساس فرمول کاروونن (HRR) به همراه ثبت محدودیت‌های فیزیکی.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
          <label className="login-field">
            <span>سن شاگرد (سال)</span>
            <input
              type="number"
              dir="ltr"
              min={10}
              max={100}
              placeholder="مثال: ۲۸"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="form-input"
            />
          </label>

          <label className="login-field">
            <span>ضربان قلب در حالت استراحت (RHR - bpm)</span>
            <input
              type="number"
              dir="ltr"
              min={35}
              max={160}
              placeholder="مثال: ۶۲"
              value={restingHr}
              onChange={(e) => setRestingHr(e.target.value)}
              className="form-input"
            />
          </label>

          <label className="login-field">
            <span>روش محاسبه حداکثر ضربان (HR Max)</span>
            <select
              value={maxHrMethod}
              onChange={(e) => setMaxHrMethod(e.target.value as MaxHrMethod)}
              className="form-input"
              style={{ padding: '8px 12px' }}
            >
              <option value="tanaka">فرمول تاناکا (Tanaka: 208 - 0.7 × سن)</option>
              <option value="fox">فرمول سنتی فاکس (Fox: 220 - سن)</option>
              <option value="custom">ثبت مستقیم رکورد تست بیشینه (Custom Peak)</option>
            </select>
          </label>

          {maxHrMethod === 'custom' && (
            <label className="login-field">
              <span>رکورد ثبت‌شده ضربان بیشینه (bpm)</span>
              <input
                type="number"
                dir="ltr"
                min={100}
                max={240}
                placeholder="مثال: ۱۹۵"
                value={customMaxHr}
                onChange={(e) => setCustomMaxHr(e.target.value)}
                className="form-input"
              />
            </label>
          )}
        </div>

        {/* Calculated Max & Karvonen Summary */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            backgroundColor: 'var(--color-surface-elevated)',
            borderRadius: 10,
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <span className="muted text-xs">حداکثر ضربان محاسبه‌شده (HR Max):</span>
            <strong style={{ display: 'block', fontSize: '18px', color: '#ef4444' }}>
              {faNumber(calculatedMax)} ضربه در دقیقه (BPM)
            </strong>
          </div>
          {numRhr && (
            <div>
              <span className="muted text-xs">ذخیره ضربان قلب (HRR - فرمول کاروونن):</span>
              <strong style={{ display: 'block', fontSize: '18px', color: '#06b6d4' }}>
                {faNumber(calculatedMax - numRhr)} BPM
              </strong>
            </div>
          )}
        </div>

        {/* Zones Preview */}
        <h4 style={{ margin: '14px 0 8px', fontSize: '14px' }}>زون‌های هدف تمرینات هوازی و استقامتی (Zones 1-5):</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {liveZones.map((z) => (
            <div
              key={z.zone}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 8,
                backgroundColor: 'var(--color-surface-elevated)',
                borderRight: `4px solid ${z.color}`,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <strong style={{ fontSize: '13px', color: z.color }}>{z.persianName}</strong>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: '11px' }}>
                  {z.purpose}
                </p>
              </div>
              <div style={{ textAlign: 'left', minWidth: 120 }}>
                <span className="badge" style={{ backgroundColor: `${z.color}20`, color: z.color, fontWeight: 700 }}>
                  {faNumber(z.minBpm)} تا {faNumber(z.maxBpm)} BPM
                </span>
                <span className="muted text-xs block" style={{ marginTop: 2, textAlign: 'center' }}>
                  {z.intensityPercent}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Limitations & Orthopedic Contraindications */}
        <label className="login-field" style={{ marginBottom: 0 }}>
          <span style={{ fontWeight: 600 }}>محدودیت‌های جسمانی، ارتوپدی و آسیب‌دیدگی‌های پزشکی شاگرد:</span>
          <textarea
            rows={3}
            placeholder="مثال: فتق دیسک L4-L5 بدون انتشار درد به پا، احتیاط در بارگذاری مستقیم ستون فقرات؛ کشیدگی خفیف مینیسک زانوی راست، ممنوعیت اسکات زیر موازی..."
            value={limitations}
            onChange={(e) => setLimitations(e.target.value)}
            className="form-input"
            style={{ width: '100%', resize: 'vertical' }}
          />
        </label>
      </section>

      {/* Save Button */}
      <div style={{ marginBottom: 32 }}>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="button button--primary"
          style={{ width: '100%', padding: '12px', fontSize: '15px' }}
        >
          <Save size={18} /> {saving ? 'در حال ذخیره‌سازی…' : 'ذخیره تنظیمات هوش مصنوعی و بیومتریک'}
        </button>
      </div>

      {/* SECTION 3: Coach Diagnostic Engine: "چرا شاگرد جواب نگرفته؟" */}
      <section className="panel-card" style={{ padding: 20, border: '1.5px solid var(--color-accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Search size={22} className="icon-accent" />
            <div>
              <h3 style={{ margin: 0 }}>موتور عیب‌یابی مربی: «چرا شاگرد جواب نگرفته؟»</h3>
              <span className="muted text-xs">تحلیل خودکار حجم، اضافه‌بار، خستگی سیستمیک و کسری ریکاوری</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleRunDiagnostic()}
            disabled={runningDiagnostic}
            className="button button--ghost"
            style={{ borderColor: 'var(--color-accent)' }}
          >
            <Sparkles size={16} /> {runningDiagnostic ? 'در حال تحلیل…' : 'اجرای مجدد عیب‌یابی هوشمند'}
          </button>
        </div>

        {diagnosticReport && (
          <div>
            {/* Status Summary Banner */}
            <div
              style={{
                padding: '16px',
                borderRadius: 12,
                backgroundColor: `${diagnosticReport.statusColor}15`,
                border: `1px solid ${diagnosticReport.statusColor}40`,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                {diagnosticReport.overallStatus === 'needs_attention' ? (
                  <AlertTriangle size={22} style={{ color: diagnosticReport.statusColor }} />
                ) : diagnosticReport.overallStatus === 'plateau' ? (
                  <AlertCircle size={22} style={{ color: diagnosticReport.statusColor }} />
                ) : (
                  <CheckCircle2 size={22} style={{ color: diagnosticReport.statusColor }} />
                )}
                <div>
                  <span className="badge" style={{ backgroundColor: `${diagnosticReport.statusColor}25`, color: diagnosticReport.statusColor }}>
                    {diagnosticReport.statusLabel}
                  </span>
                  <strong style={{ display: 'block', marginTop: 4, fontSize: '16px' }}>
                    {diagnosticReport.summaryHeadline}
                  </strong>
                </div>
              </div>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: '13px', lineHeight: 1.6 }}>
                {diagnosticReport.summaryText}
              </p>
            </div>

            {/* Metrics Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
              <span className="badge badge--neutral text-xs">
                تعداد جلسات تحلیل‌شده: {faNumber(diagnosticReport.metrics.totalSessionsAnalyzed)}
              </span>
              <span className="badge badge--neutral text-xs">
                تکرار هفتگی: {faNumber(diagnosticReport.metrics.weeklyFrequency)} جلسه/هفته
              </span>
              <span
                className="badge text-xs"
                style={{
                  backgroundColor:
                    diagnosticReport.metrics.progressiveOverloadTrend === 'growing'
                      ? '#10b98120'
                      : diagnosticReport.metrics.progressiveOverloadTrend === 'declining'
                      ? '#ef444420'
                      : '#f59e0b20',
                  color:
                    diagnosticReport.metrics.progressiveOverloadTrend === 'growing'
                      ? '#10b981'
                      : diagnosticReport.metrics.progressiveOverloadTrend === 'declining'
                      ? '#ef4444'
                      : '#f59e0b',
                }}
              >
                روند اضافه‌بار: {diagnosticReport.metrics.progressiveOverloadTrend === 'growing' ? 'رو به رشد' : diagnosticReport.metrics.progressiveOverloadTrend === 'declining' ? 'افت بار کاری' : 'فلات و ثابت'} ({faNumber(diagnosticReport.metrics.overloadChangePercent)}٪)
              </span>
              {diagnosticReport.metrics.avgRir !== null && (
                <span className="badge badge--neutral text-xs">
                  میانگین RIR ست‌ها: {faNumber(diagnosticReport.metrics.avgRir)}
                </span>
              )}
            </div>

            {/* Identified Issues & Solutions */}
            <h4 style={{ margin: '0 0 10px', fontSize: '14px' }}>آسیب‌شناسی و راهکارهای پیشنهادی برای مربی:</h4>
            {diagnosticReport.issues.length === 0 ? (
              <p className="account-muted">هیچ مانع ساختاری یا خطای بحرانی در ثبت تمرینات یافت نشد.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {diagnosticReport.issues.map((issue) => (
                  <div
                    key={issue.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 10,
                      padding: '14px',
                      backgroundColor: 'var(--color-surface-elevated)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span
                        className="badge text-xs"
                        style={{
                          backgroundColor:
                            issue.severity === 'alert'
                              ? '#ef444420'
                              : issue.severity === 'warning'
                              ? '#f59e0b20'
                              : '#3b82f620',
                          color:
                            issue.severity === 'alert'
                              ? '#ef4444'
                              : issue.severity === 'warning'
                              ? '#f59e0b'
                              : '#3b82f6',
                        }}
                      >
                        {issue.severity === 'alert' ? 'علت اصلی توقف' : issue.severity === 'warning' ? 'نکته بهبود' : 'توصیه تکمیلی'}
                      </span>
                      <strong style={{ fontSize: '14px' }}>{issue.title}</strong>
                    </div>
                    <p className="muted" style={{ margin: '0 0 8px', fontSize: '12.5px', lineHeight: 1.5 }}>
                      <strong>تحلیل وضعیت: </strong>
                      {issue.explanation}
                    </p>
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 6,
                        borderRight: '3px solid var(--color-accent)',
                      }}
                    >
                      <strong style={{ fontSize: '12px', color: 'var(--color-accent)' }}>
                        اقدام پیشنهادی برای مربی:
                      </strong>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--color-text)' }}>
                        {issue.recommendation}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </PanelPage>
  );
}
