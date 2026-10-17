import { useEffect, useState } from 'react';
import { confirmModal } from '../components/ConfirmModal';
import {
  Activity,
  AlertCircle,
  Apple,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Flame,
  Heart,
  HeartPulse,
  Info,
  Moon,
  ShieldAlert,
  Sparkles,
  Trash2,
  Utensils,
  Watch,
  Zap,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useGym } from '../context/GymProvider';
import {
  calculateMuscleRecovery,
  calculateReadinessScore,
  classifyFoodCaloricDensity,
  deleteMindfulLog,
  getStoredHealthMetrics,
  getStoredJointConcerns,
  getStoredMindfulLogs,
  HINGE_JOINT_ROUTINES,
  MINDFUL_INSIGHTS,
  NOOM_CALORIC_CATEGORIES,
  saveHealthMetrics,
  saveMindfulLog,
  saveStoredJointConcerns,
  simulateTrackerSync,
  type CaloricDensityCategory,
  type HealthMetrics,
  type HealthTrackerSource,
  type JointKey,
  type MindfulHungerTrigger,
  type MindfulLogEntry,
} from '../lib/aiHealthEngine';
import {
  ALL_AI_MODULES,
  getMyAiSettings,
  type AiModuleKey,
  type StudentBiometricsData,
} from '../lib/studentAiBiometrics';
import { faNumber, formatDate } from '../lib/format';

type ActiveTab = 'recovery' | 'muscles' | 'hinge' | 'noom' | 'biometrics';

export function AiHub() {
  const { sessions } = useGym();
  const [activeTab, setActiveTab] = useState<ActiveTab>('recovery');
  const [metrics, setMetrics] = useState<HealthMetrics>(getStoredHealthMetrics);
  const [activeJoints, setActiveJoints] = useState<JointKey[]>(getStoredJointConcerns);
  const [mindfulLogs, setMindfulLogs] = useState<MindfulLogEntry[]>(getStoredMindfulLogs);
  const [biometricsData, setBiometricsData] = useState<StudentBiometricsData | null>(null);

  useEffect(() => {
    let mounted = true;
    void getMyAiSettings()
      .then((data) => {
        if (mounted && data) {
          setBiometricsData(data);
          // If current active tab is disabled by coach, switch to first enabled
          const enabled = data.enabledModules && data.enabledModules.length > 0 ? data.enabledModules : ALL_AI_MODULES;
          if (!enabled.includes(activeTab as AiModuleKey) && activeTab !== 'biometrics') {
            setActiveTab(enabled[0] || 'biometrics');
          }
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const enabledModules = biometricsData?.enabledModules ?? ALL_AI_MODULES;

  // Noom input state
  const [foodInput, setFoodInput] = useState('');
  const [selectedTrigger, setSelectedTrigger] = useState<MindfulHungerTrigger>('physical_hunger');
  const [foodNote, setFoodNote] = useState('');
  const [lastLoggedFeedback, setLastLoggedFeedback] = useState<string | null>(null);

  // Manual metrics edit modal/drawer toggle
  const [isEditingMetrics, setIsEditingMetrics] = useState(false);
  const [editSleep, setEditSleep] = useState(metrics.sleepHours.toString());
  const [editSleepQuality, setEditSleepQuality] = useState(metrics.sleepQualityScore.toString());
  const [editRhr, setEditRhr] = useState(metrics.restingHeartRate.toString());
  const [editHrv, setEditHrv] = useState(metrics.heartRateVariability.toString());

  const readiness = calculateReadinessScore(metrics, sessions);
  const muscleRecoveries = calculateMuscleRecovery(sessions);

  const handleSync = (source: HealthTrackerSource) => {
    const updated = simulateTrackerSync(source);
    setMetrics(updated);
    setEditSleep(updated.sleepHours.toString());
    setEditSleepQuality(updated.sleepQualityScore.toString());
    setEditRhr(updated.restingHeartRate.toString());
    setEditHrv(updated.heartRateVariability.toString());
  };

  const handleSaveManual = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveHealthMetrics({
      sleepHours: parseFloat(editSleep) || 7.5,
      sleepQualityScore: parseInt(editSleepQuality, 10) || 80,
      restingHeartRate: parseInt(editRhr, 10) || 60,
      heartRateVariability: parseInt(editHrv, 10) || 65,
      source: 'manual',
    });
    setMetrics(updated);
    setIsEditingMetrics(false);
  };

  const toggleJoint = (joint: JointKey) => {
    const next = activeJoints.includes(joint)
      ? activeJoints.filter((j) => j !== joint)
      : [...activeJoints, joint];
    setActiveJoints(next);
    saveStoredJointConcerns(next);
  };

  const handleAddMindfulLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodInput.trim()) return;

    const category = classifyFoodCaloricDensity(foodInput);
    const newEntry = saveMindfulLog({
      foodName: foodInput.trim(),
      trigger: selectedTrigger,
      category,
      notes: foodNote.trim() || undefined,
    });

    setMindfulLogs([newEntry, ...mindfulLogs]);
    setFoodInput('');
    setFoodNote('');
    setLastLoggedFeedback(MINDFUL_INSIGHTS[selectedTrigger].advice);
  };

  const handleDeleteMindfulLog = async (id: string, foodName: string) => {
    if (!await confirmModal({
      title: 'حذف ثبت تغذیه',
      message: `ثبت «${foodName}» حذف شود؟`,
      confirmText: 'حذف',
      cancelText: 'انصراف',
      variant: 'danger',
    })) return;
    const remaining = deleteMindfulLog(id);
    setMindfulLogs(remaining);
  };

  return (
    <div className="page-stack ai-hub-page">
      {/* Header section */}
      <section className="welcome-row">
        <div>
          <p className="eyebrow">اکوسیستم هوش مصنوعی سلامتی و عملکرد</p>
          <h2>مغز هوشمند میتی<span className="accent-dot">.</span></h2>
          <p className="muted">
            تلفیق هوشمند شاخص‌های فیزیولوژی (Whoop & Oura)، ریکاوری عضلانی (Fitbod)، حرکات اصلاحی (Hinge Health) و عادات رفتاری تغذیه (Noom)
          </p>
        </div>
        <Link className="text-link desktop-only" to="/program">
          دیدن برنامهٔ ورزشی <ArrowRight size={15} />
        </Link>
      </section>

      {/* Primary Tab Navigation */}
      <div className="ai-tabs-bar" role="tablist" aria-label="بخش‌های هوش سلامتی">
        {enabledModules.includes('recovery') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'recovery'}
            className={`ai-tab-button ${activeTab === 'recovery' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('recovery')}
          >
            <HeartPulse size={16} />
            <span>ریکاوری و فیزیولوژی</span>
            <span className="ai-tab-badge">Whoop</span>
          </button>
        )}

        {enabledModules.includes('muscles') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'muscles'}
            className={`ai-tab-button ${activeTab === 'muscles' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('muscles')}
          >
            <Activity size={16} />
            <span>نقشه عضلات</span>
            <span className="ai-tab-badge">Fitbod</span>
          </button>
        )}

        {enabledModules.includes('hinge') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'hinge'}
            className={`ai-tab-button ${activeTab === 'hinge' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('hinge')}
          >
            <ShieldAlert size={16} />
            <span>مفاصل و آسیب‌ها</span>
            <span className="ai-tab-badge">Hinge</span>
          </button>
        )}

        {enabledModules.includes('noom') && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'noom'}
            className={`ai-tab-button ${activeTab === 'noom' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('noom')}
          >
            <Utensils size={16} />
            <span>تغذیه رفتاری</span>
            <span className="ai-tab-badge">Noom</span>
          </button>
        )}

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'biometrics'}
          className={`ai-tab-button ${activeTab === 'biometrics' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('biometrics')}
        >
          <Heart size={16} />
          <span>پایش قلب و بیومتریک</span>
          <span className="ai-tab-badge">HR Zones</span>
        </button>
      </div>

      {/* ================= TAB 1: WHOOP / OURA RECOVERY & READINESS ================= */}
      {activeTab === 'recovery' && (
        <div className="ai-tab-content">
          <div className="ai-hero-card" style={{ borderColor: `${readiness.color}40` }}>
            <div className="ai-hero-card__main">
              <div className="ai-gauge-container">
                <div
                  className="ai-gauge-circle"
                  style={{
                    background: `conic-gradient(${readiness.color} ${readiness.score * 3.6}deg, var(--color-surface-hover) 0deg)`,
                  }}
                >
                  <div className="ai-gauge-inner">
                    <span className="ai-gauge-value" style={{ color: readiness.color }}>
                      {faNumber(readiness.score)}٪
                    </span>
                    <span className="ai-gauge-label">آمادگی روز</span>
                  </div>
                </div>
              </div>

              <div className="ai-hero-details">
                <div className="ai-tag-row">
                  <span className={`badge ${readiness.badgeClass}`}>{readiness.levelLabel}</span>
                  <span className="badge badge--neutral">
                    {metrics.source === 'whoop' && 'همگام‌شده با Whoop 4.0'}
                    {metrics.source === 'oura' && 'همگام‌شده با Oura Ring Gen3'}
                    {metrics.source === 'apple_health' && 'همگام‌شده با Apple Health'}
                    {metrics.source === 'manual' && 'ثبت دستی کاربر'}
                  </span>
                </div>
                <h3>{readiness.recoveryTitle}</h3>
                <p className="ai-recommendation-box">
                  <Sparkles size={18} className="ai-sparkle-icon" />
                  <span>{readiness.coachRecommendation}</span>
                </p>
                <div className="ai-mini-stats">
                  <div className="ai-mini-stat">
                    <Flame size={16} className="text-warning" />
                    <div>
                      <strong>{faNumber(readiness.dailyStrain)} / ۲۱</strong>
                      <small>فشار روزانه (Strain)</small>
                    </div>
                  </div>
                  <div className="ai-mini-stat">
                    <Moon size={16} className="text-info" />
                    <div>
                      <strong>{faNumber(metrics.sleepHours)} ساعت ({faNumber(metrics.sleepQualityScore)}٪)</strong>
                      <small>خواب دیشب</small>
                    </div>
                  </div>
                  <div className="ai-mini-stat">
                    <HeartPulse size={16} className="text-success" />
                    <div>
                      <strong>{faNumber(metrics.heartRateVariability)} ms | {faNumber(metrics.restingHeartRate)} bpm</strong>
                      <small>HRV و ضربان استراحت</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Bar */}
            <div className="ai-sync-actions">
              <span className="muted text-sm">
                آخرین به‌روزرسانی: {formatDate(new Date(metrics.lastSyncedAt), { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="ai-sync-buttons">
                <button
                  type="button"
                  className="button button--small button--secondary"
                  onClick={() => handleSync('whoop')}
                  title="شبیه‌سازی دریافت داده از بند سلامتی Whoop"
                >
                  <Zap size={14} /> همگام‌سازی Whoop
                </button>
                <button
                  type="button"
                  className="button button--small button--secondary"
                  onClick={() => handleSync('oura')}
                  title="شبیه‌سازی دریافت داده از حلقه هوشمند Oura"
                >
                  <Watch size={14} /> همگام‌سازی Oura
                </button>
                <button
                  type="button"
                  className="button button--small button--secondary"
                  onClick={() => handleSync('apple_health')}
                  title="همگام‌سازی با ساعت و تلفن همراه"
                >
                  <Apple size={14} /> Health Connect
                </button>
                <button
                  type="button"
                  className="button button--small button--ghost"
                  onClick={() => setIsEditingMetrics(!isEditingMetrics)}
                >
                  {isEditingMetrics ? 'بستن' : 'ویرایش دستی'}
                </button>
              </div>
            </div>

            {/* Manual Edit Drawer */}
            {isEditingMetrics && (
              <form onSubmit={handleSaveManual} className="ai-manual-form">
                <h4>تنظیم دستی شاخص‌های فیزیولوژیک</h4>
                <div className="ai-form-grid">
                  <label className="field">
                    <span>مدت زمان خواب (ساعت)</span>
                    <input
                      type="number"
                      step="0.1"
                      min="3"
                      max="14"
                      value={editSleep}
                      onChange={(e) => setEditSleep(e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>کیفیت خواب (۰ تا ۱۰۰٪)</span>
                    <input
                      type="number"
                      min="20"
                      max="100"
                      value={editSleepQuality}
                      onChange={(e) => setEditSleepQuality(e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>ضربان قلب استراحت (RHR bpm)</span>
                    <input
                      type="number"
                      min="40"
                      max="110"
                      value={editRhr}
                      onChange={(e) => setEditRhr(e.target.value)}
                      required
                    />
                  </label>
                  <label className="field">
                    <span>تغییرپذیری ضربان قلب (HRV ms)</span>
                    <input
                      type="number"
                      min="20"
                      max="150"
                      value={editHrv}
                      onChange={(e) => setEditHrv(e.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <button type="submit" className="button button--primary button--small">
                    محاسبه مجدد آمادگی
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Scientific Info Box */}
          <div className="ai-info-panel">
            <Info size={18} className="text-info" />
            <div>
              <strong>نحوهٔ عملکرد موتور فیزیولوژی Whoop & Oura در میتی:</strong>
              <p>
                میزان آمادگی روزانه (Readiness) ترکیبی از شاخص اتونومیک سیستم عصبی (HRV)، استراحت قلب در حالت خواب، و فشار تجمعی جلسات گذشته است. نمره بالای ۸۰٪ نشان‌دهندهٔ زمان ایده‌آل برای بیش‌باری تدریجی و سنگین‌ترین ست‌هاست.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 2: FITBOD MUSCLE HEATMAP ================= */}
      {activeTab === 'muscles' && (
        <div className="ai-tab-content">
          <div className="card">
            <div className="card-header">
              <div>
                <h3>نقشه حرارتی و وضعیت ریکاوری عضلات</h3>
                <p className="muted">
                  محاسبهٔ بلادرنگ ترمیم فیبرهای عضلانی بر اساس جلسات ثبت‌شده در دفترچه تمرین
                </p>
              </div>
              <span className="badge badge--neutral">موتور اختصاصی Fitbod</span>
            </div>

            <div className="muscle-grid">
              {muscleRecoveries.map((m) => (
                <div key={m.zoneKey} className="muscle-card">
                  <div className="muscle-card__header">
                    <strong>{m.label}</strong>
                    <span className="muscle-pct" style={{ color: m.color }}>
                      {faNumber(m.recoveryPercent)}٪
                    </span>
                  </div>

                  <div className="progress-bar">
                    <div
                      className="progress-bar__fill"
                      style={{
                        width: `${m.recoveryPercent}%`,
                        backgroundColor: m.color,
                      }}
                    />
                  </div>

                  <div className="muscle-card__footer">
                    <span className="text-xs" style={{ color: m.color }}>
                      {m.statusLabel}
                    </span>
                    <span className="text-xs muted">
                      {m.hoursUntilFull === 0
                        ? '۱۰۰٪ آماده'
                        : `~${faNumber(m.hoursUntilFull)} ساعت تا بازیابی`}
                    </span>
                  </div>

                  {m.setsLast3Days > 0 && (
                    <div className="muscle-card__detail">
                      <small className="muted">
                        {faNumber(m.setsLast3Days)} ست در ۳ روز اخیر
                      </small>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="muscle-legend">
              <span className="legend-item">
                <span className="legend-dot bg-success" /> ۸۰ تا ۱۰۰٪: آماده تمرین سنگین
              </span>
              <span className="legend-item">
                <span className="legend-dot bg-warning" /> ۵۵ تا ۷۹٪: ریکاوری متوسط
              </span>
              <span className="legend-item">
                <span className="legend-dot bg-danger" /> کمتر از ۵۵٪: فیبرهای عضلانی خسته
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 3: HINGE HEALTH PREHAB & JOINTS ================= */}
      {activeTab === 'hinge' && (
        <div className="ai-tab-content">
          <div className="card">
            <div className="card-header">
              <div>
                <h3>سیستم مراقبت مفاصل و فیزیوتراپی (سبک Hinge Health)</h3>
                <p className="muted">
                  مفاصلی که در آن‌ها احساس درد، خشکی یا تیر کشیدن داری را علامت بزن تا روتین اصلاحی هدفمند دریافت کنی:
                </p>
              </div>
            </div>

            {/* Joint Selector Pills */}
            <div className="joint-pills">
              {(Object.keys(HINGE_JOINT_ROUTINES) as JointKey[]).map((key) => {
                const routine = HINGE_JOINT_ROUTINES[key];
                const isSelected = activeJoints.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`joint-pill ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => toggleJoint(key)}
                  >
                    {isSelected ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{routine.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Selected Joint Routines */}
            {activeJoints.length === 0 ? (
              <div className="empty-prehab-state">
                <CheckCircle2 size={36} className="text-success" />
                <h4>هیچ مفصل حساسی انتخاب نشده است</h4>
                <p className="muted">
                  اگر در زانو، شانه، کمر یا مچ احساس ناراحتی داری، از دکمه‌های بالا انتخاب کن تا حرکات اصلاحی پیش از تمرین نمایش داده شوند.
                </p>
              </div>
            ) : (
              <div className="joint-routines-stack">
                {activeJoints.map((jointKey) => {
                  const routine = HINGE_JOINT_ROUTINES[jointKey];
                  return (
                    <div key={jointKey} className="prehab-card">
                      <div className="prehab-card__header">
                        <div>
                          <h4>روتین تخصصی: {routine.label}</h4>
                          <p className="text-sm muted">{routine.commonSymptoms}</p>
                        </div>
                        <span className="badge badge--warning">پیش از تمرین</span>
                      </div>

                      <div className="prehab-exercises-list">
                        {routine.exercises.map((ex, idx) => (
                          <div key={ex.id} className="prehab-exercise-item">
                            <div className="prehab-ex-num">{faNumber(idx + 1)}</div>
                            <div className="prehab-ex-body">
                              <div className="prehab-ex-title">
                                <strong>{ex.name}</strong>
                                <span className="badge badge--neutral">
                                  {ex.sets} × {ex.reps}
                                </span>
                              </div>
                              <p className="prehab-ex-purpose">{ex.purpose}</p>
                              <p className="prehab-ex-instruction">
                                <strong>راهنمای اجرا:</strong> {ex.instructions}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 4: NOOM MINDFUL NUTRITION ================= */}
      {activeTab === 'noom' && (
        <div className="ai-tab-content">
          <div className="card">
            <div className="card-header">
              <div>
                <h3>هوشمندی و رفتارشناسی تغذیه (سبک Noom)</h3>
                <p className="muted">
                  سیستم کدگذاری رنگی دانسیته کالری + ردیابی عاطفی و چرایی غذا خوردن
                </p>
              </div>
            </div>

            {/* Noom 3 Colors Display */}
            <div className="noom-colors-grid">
              {(Object.keys(NOOM_CALORIC_CATEGORIES) as CaloricDensityCategory[]).map((cat) => {
                const info = NOOM_CALORIC_CATEGORIES[cat];
                return (
                  <div key={cat} className="noom-color-card" style={{ borderColor: `${info.color}50` }}>
                    <div className="noom-color-card__header">
                      <span className="noom-color-dot" style={{ backgroundColor: info.color }} />
                      <strong>{info.label}</strong>
                    </div>
                    <p className="text-xs muted">{info.description}</p>
                    <div className="noom-target-badge" style={{ color: info.color }}>
                      هدف: {info.targetPercentage}
                    </div>
                    <ul className="noom-examples-list">
                      {info.examples.slice(0, 3).map((eg, i) => (
                        <li key={i}>{eg}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Mindful Eating Check-in Form */}
            <form onSubmit={handleAddMindfulLog} className="mindful-form">
              <h4>ثبت هوشمند خوراک با بازخورد روانشناسی</h4>
              <div className="mindful-form-row">
                <label className="field" style={{ flex: 2 }}>
                  <span>نام خوراکی یا وعده</span>
                  <input
                    type="text"
                    placeholder="مثلاً سالاد فصل، سیب، یا شکلات صبحانه..."
                    value={foodInput}
                    onChange={(e) => setFoodInput(e.target.value)}
                    required
                  />
                </label>

                <label className="field" style={{ flex: 2 }}>
                  <span>چرا این وعده را خوردی؟ (علت روانی)</span>
                  <select
                    value={selectedTrigger}
                    onChange={(e) => setSelectedTrigger(e.target.value as MindfulHungerTrigger)}
                  >
                    <option value="physical_hunger">گرسنگی فیزیکی واقعی معده</option>
                    <option value="stress_anxiety">استرس، تنش کاری یا اضطراب</option>
                    <option value="boredom_habit">بی‌حوصلگی یا عادت موقع تماشا/کار</option>
                    <option value="social_celebration">دورهمی، جشن و همراهی با جمع</option>
                  </select>
                </label>

                <div className="field-action" style={{ alignSelf: 'flex-end' }}>
                  <button type="submit" className="button button--primary">
                    تحلیل و ثبت هوشمند
                  </button>
                </div>
              </div>
            </form>

            {/* Feedback alert after log */}
            {lastLoggedFeedback && (
              <div className="ai-feedback-banner">
                <Brain size={20} className="text-primary" />
                <div>
                  <strong>بینش روانشناسی Noom:</strong>
                  <p>{lastLoggedFeedback}</p>
                </div>
              </div>
            )}

            {/* Mindful Logs History */}
            {mindfulLogs.length > 0 && (
              <div className="mindful-history">
                <div className="mindful-history-header">
                  <span className="eyebrow">تحلیل‌های اخیر</span>
                  <h5>سوابق تحلیل هوشمند خوراک</h5>
                </div>
                <div className="mindful-history-list">
                  {mindfulLogs.slice(0, 5).map((log) => {
                    const catInfo = NOOM_CALORIC_CATEGORIES[log.category];
                    const insight = MINDFUL_INSIGHTS[log.trigger];
                    const formattedDate = formatDate(new Date(log.timestamp), {
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    return (
                      <article key={log.id} className="mindful-history-card">
                        <div className="mindful-card-top">
                          <div className="mindful-card-title-group">
                            <span
                              className="noom-color-dot"
                              style={{
                                backgroundColor: catInfo.color,
                                boxShadow: `0 0 0 3px ${catInfo.color}25`,
                              }}
                              title={catInfo.label}
                            />
                            <strong className="mindful-food-title">{log.foodName}</strong>
                          </div>

                          <div className="mindful-card-actions">
                            <span
                              className="badge"
                              style={{
                                color: catInfo.color,
                                backgroundColor: `${catInfo.color}15`,
                                borderColor: `${catInfo.color}40`,
                                fontSize: '11px',
                                fontWeight: 700,
                              }}
                            >
                              {catInfo.label}
                            </span>
                            <button
                              type="button"
                              className="button button--ghost icon-only mindful-delete-btn"
                              onClick={() => handleDeleteMindfulLog(log.id, log.foodName)}
                              title="حذف این ثبت"
                              aria-label={`حذف ثبت ${log.foodName}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        <div className="mindful-card-meta">
                          <span className="mindful-trigger-pill">
                            <Brain size={13} className="icon-accent" />
                            <span>محرک ذهنی: <strong>{insight.label}</strong></span>
                          </span>
                          <span className="mindful-time-pill">
                            <Clock size={13} className="text-muted" />
                            <span>{formattedDate}</span>
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 5: BIOMETRICS & CARDIOVASCULAR ZONES ================= */}
      {activeTab === 'biometrics' && (
        <div className="ai-tab-content">
          <div className="card" style={{ padding: 22 }}>
            <div className="card-header" style={{ marginBottom: 16 }}>
              <div>
                <span className="eyebrow">فیزیولوژی و سیستم قلبی-عروقی</span>
                <h3>پایش بیومتریک و زون‌های تمرینی قلب</h3>
              </div>
              <span className="badge badge--neutral">محاسبه علمی بر پایه HRR</span>
            </div>

            <p className="muted" style={{ fontSize: '13px', lineHeight: 1.6, marginBottom: 20 }}>
              ضربان قلب و زون‌های ۵ گانهٔ تمرینی، شدت تلاش سیستم هوازی و بی‌هوازی شما را تعیین می‌کنند. تمرین در هر زون، اثر انطباقی فیزیولوژیک متفاوتی بر میتوکندری‌ها، چربی‌سوزی، و آستانه اسید لاکتیک ایجاد می‌کند.
            </p>

            {/* Quick Stats Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 14,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="muted text-xs block">حداکثر ضربان قلب (HR Max)</span>
                <strong style={{ fontSize: '24px', color: '#ef4444' }}>
                  {faNumber(biometricsData?.maxHr ?? 190)}
                  <small style={{ fontSize: '13px', fontWeight: 400, marginInlineStart: 4 }}>BPM</small>
                </strong>
                <span className="muted text-xs block" style={{ marginTop: 4 }}>
                  روش: {biometricsData?.maxHrMethod === 'fox' ? 'فرمول فاکس (۲۲۰ - سن)' : biometricsData?.maxHrMethod === 'custom' ? 'رکورد تست بیشینه' : 'فرمول تاناکا (۲۰۸ - ۰٫۷×سن)'}
                </span>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="muted text-xs block">ضربان قلب در استراحت (RHR)</span>
                <strong style={{ fontSize: '24px', color: '#06b6d4' }}>
                  {biometricsData?.restingHr ? faNumber(biometricsData.restingHr) : '—'}
                  <small style={{ fontSize: '13px', fontWeight: 400, marginInlineStart: 4 }}>BPM</small>
                </strong>
                <span className="muted text-xs block" style={{ marginTop: 4 }}>
                  {biometricsData?.restingHr ? 'ثبت‌شده در پایش بدنی' : 'هنوز ثبت نشده است'}
                </span>
              </div>

              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <span className="muted text-xs block">سن ورزشکار</span>
                <strong style={{ fontSize: '24px', color: '#f59e0b' }}>
                  {biometricsData?.age ? faNumber(biometricsData.age) : '—'}
                  <small style={{ fontSize: '13px', fontWeight: 400, marginInlineStart: 4 }}>سال</small>
                </strong>
                <span className="muted text-xs block" style={{ marginTop: 4 }}>
                  شاخص مبنای انطباق قلبی
                </span>
              </div>
            </div>

            {/* Coach Limitations & Medical Constraints Note */}
            {biometricsData?.limitations && biometricsData.limitations.trim().length > 0 && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 12,
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1.5px solid rgba(239, 68, 68, 0.3)',
                  marginBottom: 24,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <ShieldAlert size={18} style={{ color: '#ef4444' }} />
                  <strong style={{ color: '#ef4444', fontSize: '14px' }}>
                    ملاحظات پزشکی و محدودیت‌های ثبت‌شده توسط مربی:
                  </strong>
                </div>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text)' }}>
                  {biometricsData.limitations}
                </p>
              </div>
            )}

            {/* Target Zones Detailed Breakdown */}
            <h4 style={{ margin: '0 0 12px', fontSize: '15px' }}>زون‌های هدف تمرین و محدوده ضربان قلب (HR Zones):</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(biometricsData?.zones ?? []).map((z) => (
                <div
                  key={z.zone}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 18px',
                    borderRadius: 10,
                    backgroundColor: 'var(--color-surface-elevated)',
                    borderRight: `5px solid ${z.color}`,
                    gap: 14,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ flex: '1 1 240px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong style={{ color: z.color, fontSize: '14px' }}>{z.persianName}</strong>
                      <span className="muted text-xs">({z.name})</span>
                    </div>
                    <p className="muted" style={{ margin: '4px 0 0', fontSize: '12px', lineHeight: 1.5 }}>
                      {z.purpose}
                    </p>
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 140 }}>
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${z.color}20`,
                        color: z.color,
                        fontWeight: 700,
                        fontSize: '13px',
                        padding: '4px 10px',
                      }}
                    >
                      {faNumber(z.minBpm)} تا {faNumber(z.maxBpm)} BPM
                    </span>
                    <span className="muted text-xs block" style={{ marginTop: 4, textAlign: 'center' }}>
                      فشار: {z.intensityPercent}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
