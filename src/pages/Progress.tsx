import { useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarDays, ChevronDown, Plus, TrendingDown, TrendingUp, Trophy, Weight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ProgressChart } from '../components/ProgressChart';
import { SectionHeading } from '../components/SectionHeading';
import { useGym } from '../context/GymProvider';
import { exercises } from '../data/exercises';
import { getWorkoutTemplate, programExerciseName } from '../data/workouts';
import { getBestSet, getExercisePerformances, getSessionTotals, getWeekComparison, getWeeklyTotals } from '../lib/analytics';
import { faNumber, dateInputValue, formatDate, formatDuration, kg } from '../lib/format';

export function Progress() {
  const { sessions, bodyweights, profile, addBodyweight } = useGym();
  const [selectedExercise, setSelectedExercise] = useState('barbell-bench-press');
  const [selectedMetric, setSelectedMetric] = useState<'weight' | 'reps' | 'volume'>('weight');
  const [weightInput, setWeightInput] = useState('');
  const [weightDate, setWeightDate] = useState(dateInputValue());
  const [weightNote, setWeightNote] = useState('');
  const [formError, setFormError] = useState('');
  const completedSessions = sessions.filter((session) => session.status === 'completed').sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  const performances = getExercisePerformances(sessions, selectedExercise);
  const chartPoints = [...performances].reverse().map((performance) => ({
    label: formatDate(performance.session.startedAt, { month: 'short', day: 'numeric' }),
    value: selectedMetric === 'weight'
      ? Math.max(...performance.sets.map((set) => set.weightKg))
      : selectedMetric === 'reps'
        ? performance.sets.reduce((sum, set) => sum + set.reps, 0)
        : performance.sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0),
  }));
  const selectedName = exercises.find((exercise) => exercise.id === selectedExercise)?.name ?? 'حرکت';
  const metricUnit = selectedMetric === 'weight' ? ' کیلوگرم' : selectedMetric === 'reps' ? ' تکرار' : ' کیلوگرم·تکرار';
  const metricDescription = selectedMetric === 'weight' ? 'سنگین‌ترین ست کاری ثبت‌شده در هر جلسهٔ کامل‌شده · کیلوگرم' : selectedMetric === 'reps' ? 'مجموع تکرارهای ثبت‌شده برای این حرکت در هر جلسهٔ کامل‌شده' : 'وزنه × تکرار ثبت‌شده برای این حرکت در هر جلسهٔ کامل‌شده';
  const metricName = selectedMetric === 'weight' ? 'وزنهٔ کاری' : selectedMetric === 'reps' ? 'مجموع تکرارها' : 'حجم تمرین';
  const latestWeight = bodyweights[0]?.weightKg ?? profile.weightKg;
  const firstLoggedWeight = bodyweights.length > 1 ? bodyweights.at(-1)?.weightKg ?? null : null;
  const change = firstLoggedWeight === null || firstLoggedWeight === undefined ? null : latestWeight - firstLoggedWeight;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const recentWeights = bodyweights.filter((entry) => new Date(`${entry.date}T00:00:00`).getTime() >= new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate()).getTime());
  const weeklyAverage = recentWeights.length ? recentWeights.reduce((sum, entry) => sum + entry.weightKg, 0) / recentWeights.length : null;
  const weightPoints = [...bodyweights].reverse().map((entry) => ({ label: formatDate(`${entry.date}T00:00:00`, { month: 'short', day: 'numeric' }), value: entry.weightKg }));
  const records = useMemo(() => exercises.map((exercise) => ({ exercise, best: getBestSet(sessions, exercise.id) })).filter((item) => item.best).slice(0, 6), [sessions]);
  const weeklyTotals = useMemo(() => getWeeklyTotals(sessions, 6), [sessions]);
  const weekComparison = useMemo(() => getWeekComparison(weeklyTotals), [weeklyTotals]);
  const weeklyPoints = weeklyTotals.map((week) => ({
    label: formatDate(week.start, { month: 'short', day: 'numeric' }),
    value: Math.round(week.volumeKg),
  }));
  const weeklyVolumeTotal = weeklyTotals.reduce((sum, week) => sum + week.volumeKg, 0);
  const weekChangeText = weekComparison && weekComparison.volumeChangePercent !== null
    ? `${weekComparison.volumeChange > 0 ? '+' : ''}${faNumber(Math.round(weekComparison.volumeChangePercent))}٪`
    : '—';

  const submitWeight = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = Number(weightInput);
    if (!Number.isFinite(value) || value < 30 || value > 300) { setFormError('وزن بدن را بین ۳۰ تا ۳۰۰ کیلوگرم وارد کن.'); return; }
    if (!weightDate) { setFormError('برای این ثبت، تاریخ را انتخاب کن.'); return; }
    await addBodyweight({ date: weightDate, weightKg: value, notes: weightNote.trim() || undefined });
    setWeightInput(''); setWeightNote(''); setFormError('');
  };

  return (
    <div className="page-stack">
      <SectionHeading eyebrow="دادهٔ واقعی · پیشرفت پیوسته" title="پیشرفت، نه حدس و گمان." description="روندها از جلسه‌ها و وزن‌کشی‌های ثبت‌شده ساخته می‌شوند. هیچ عددی به‌عنوان رکورد شخصی حدس زده نمی‌شود." />
      <div className="progress-summary-cards">
        <div className="progress-summary-card panel-card"><span className="summary-card-icon"><CalendarDays size={17} /></span><span className="eyebrow">جلسه‌های ثبت‌شده</span><strong>{faNumber(completedSessions.length)}</strong><small>جلسهٔ کامل‌شده</small></div>
        <div className="progress-summary-card panel-card"><span className="summary-card-icon"><Weight size={17} /></span><span className="eyebrow">وزن فعلی بدن</span><strong>{kg(latestWeight)}</strong><small>{bodyweights.length ? 'آخرین ثبت' : 'وزن پایهٔ پروفایل · هنوز ثبت نشده'}</small></div>
        <div className="progress-summary-card panel-card"><span className="summary-card-icon"><Activity size={17} /></span><span className="eyebrow">تغییر وزن</span><strong>{change === null ? '—' : `${change > 0 ? '+' : ''}${kg(change)}`}</strong><small>{change === null ? 'دست‌کم دو بار وزن را ثبت کن' : 'از اولین وزن‌کشی ثبت‌شده'}</small></div>
      </div>

      <section className="panel-card progression-panel">
        <div className="progression-panel__header"><div><span className="eyebrow">سوابق حرکت</span><h2>یک حرکت را دنبال کن.</h2></div><div className="progression-panel__controls"><label className="select-with-icon"><span className="sr-only">انتخاب حرکت</span><select value={selectedExercise} onChange={(event) => setSelectedExercise(event.target.value)}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select><ChevronDown size={15} /></label><label className="select-with-icon"><span className="sr-only">انتخاب معیار نمودار</span><select value={selectedMetric} onChange={(event) => setSelectedMetric(event.target.value as 'weight' | 'reps' | 'volume')}><option value="weight">وزنهٔ کاری</option><option value="reps">مجموع تکرارها</option><option value="volume">حجم تمرین</option></select><ChevronDown size={15} /></label></div></div>
        <p className="muted">{metricDescription}</p>
        <ProgressChart points={chartPoints} unit={metricUnit} label={`${selectedName} · ${metricName}`} />
        <div className="history-table-wrap">
          <table className="history-table"><thead><tr><th>تاریخ</th><th>ست کاری</th><th>تکرار در ذخیره (RIR)</th><th>جلسه</th></tr></thead><tbody>{performances.flatMap((performance) => performance.sets.map((set) => ({ performance, set }))).map(({ performance, set }) => <tr key={`${performance.session.id}-${set.setNumber}`}><td>{formatDate(performance.session.startedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td><td><strong>{kg(set.weightKg)} × {faNumber(set.reps)}</strong></td><td>{faNumber(set.rir)}</td><td>{getWorkoutTemplate(performance.session.templateId)?.name ?? performance.session.name}</td></tr>)}</tbody></table>
          {!performances.length && <p className="history-table-empty">هنوز عملکردی برای «{selectedName}» ثبت نشده است. در حالت تمرین یک ست ثبت کن تا اینجا نمایش داده شود.</p>}
        </div>
      </section>

      <section className="panel-card weekly-volume-panel">
        <div className="card-topline"><div><span className="eyebrow">حجم هفتگی</span><h2>هفته‌به‌هفته سبک‌تر یا سنگین‌تر؟</h2></div>{weekComparison && weekComparison.volumeChange < 0 ? <TrendingDown size={18} className="icon-accent" /> : <TrendingUp size={18} className="icon-accent" />}</div>
        <p className="muted">حجم هر هفته = مجموع «وزنه × تکرار» جلسه‌های کامل‌شدهٔ همان هفته. هفته از دوشنبه شروع می‌شود و روز ششم اختیاری هم حساب می‌شود.</p>
        <div className="week-compare">
          <div><span>این هفته</span><strong>{faNumber(Math.round(weekComparison?.current.volumeKg ?? 0))}</strong><small>کیلوگرم·تکرار · {faNumber(weekComparison?.current.sessionCount ?? 0)} جلسه</small></div>
          <div><span>هفتهٔ گذشته</span><strong>{faNumber(Math.round(weekComparison?.previous.volumeKg ?? 0))}</strong><small>کیلوگرم·تکرار · {faNumber(weekComparison?.previous.sessionCount ?? 0)} جلسه</small></div>
          <div className={weekComparison && weekComparison.volumeChange !== 0 ? 'week-compare-change' : undefined}><span>تغییر حجم</span><strong>{weekChangeText}</strong><small>{weekComparison?.volumeChangePercent === null ? 'هفتهٔ گذشته حجمی ثبت نشده' : `${faNumber(Math.round(Math.abs(weekComparison?.volumeChange ?? 0)))} کیلوگرم·تکرار ${(weekComparison?.volumeChange ?? 0) < 0 ? 'کمتر' : 'بیشتر'}`}</small></div>
        </div>
        <ProgressChart points={weeklyPoints} unit=" کیلوگرم·تکرار" label="حجم هفتگی" />
        <div className="week-strip">
          {weeklyTotals.slice().reverse().map((week) => (
            <div key={week.start.toISOString()} className="week-strip-row">
              <span>هفتهٔ {formatDate(week.start, { month: 'short', day: 'numeric' })}</span>
              <strong>{faNumber(Math.round(week.volumeKg))} کیلوگرم·تکرار</strong>
              <small>{faNumber(week.sessionCount)} جلسه · {faNumber(week.setCount)} ست · {faNumber(week.repCount)} تکرار</small>
            </div>
          ))}
        </div>
        {weeklyVolumeTotal === 0 && <p className="muted small-text">با کامل کردن اولین جلسه، ستون‌های همین نمودار پر می‌شوند.</p>}
      </section>

      <section id="bodyweight" className="bodyweight-progress-grid">
        <div className="panel-card bodyweight-trend-card">
          <div className="card-topline"><div><span className="eyebrow">روند وزن بدن</span><h2>پیوسته باش، نه افراطی.</h2></div><Weight size={18} className="icon-accent" /></div>
          <div className="bodyweight-metrics"><div><span>فعلی</span><strong>{kg(latestWeight)}</strong><small>{bodyweights.length ? 'آخرین ثبت' : 'وزن پایهٔ پروفایل'}</small></div><div><span>آغازین</span><strong>{firstLoggedWeight === null ? '—' : kg(firstLoggedWeight)}</strong><small>{firstLoggedWeight === null ? 'به ۲ ثبت وزن نیاز است' : 'اولین ثبت'}</small></div><div><span>میانگین ۷ روز</span><strong>{weeklyAverage === null ? '—' : kg(weeklyAverage)}</strong><small>{recentWeights.length ? `${faNumber(recentWeights.length)} بار ثبت` : 'ثبت تازه‌ای نیست'}</small></div></div>
          <ProgressChart points={weightPoints} unit=" کیلوگرم" label="وزن بدن" color="var(--blue)" />
          <div className="weight-log-list">{bodyweights.slice(0, 5).map((entry) => <div key={entry.id}><span>{formatDate(`${entry.date}T00:00:00`, { weekday: 'short', day: 'numeric', month: 'short' })}</span><strong>{kg(entry.weightKg)}</strong>{entry.notes && <small>{entry.notes}</small>}</div>)}{!bodyweights.length && <p className="muted small-text">چند بار در شرایط مشابه وزن‌کشی کن تا روند واقعی‌ات مشخص شود.</p>}</div>
        </div>
        <div className="panel-card bodyweight-form-card">
          <span className="eyebrow">ثبت وزن</span><h3>وزن بدن را وارد کن</h3><p className="muted">در شرایط مشابه وزن‌کشی کن و روند را در طول زمان بررسی کن.</p>
          <form onSubmit={(event) => void submitWeight(event)} className="form-stack">
            <label className="field-control"><span>وزن <small>کیلوگرم</small></span><input type="number" min="30" max="300" step="0.1" inputMode="decimal" placeholder="۷۷٫۰" value={weightInput} onChange={(event) => setWeightInput(event.target.value)} required /></label>
            <label className="field-control"><span>تاریخ</span><input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} required /></label>
            <label className="field-control"><span>یادداشت <small>اختیاری</small></span><input value={weightNote} onChange={(event) => setWeightNote(event.target.value)} placeholder="صبح، پیش از صبحانه…" /></label>
            {formError && <p role="alert" className="form-error">{formError}</p>}
            <button className="button button--primary button--full" type="submit"><Plus size={16} /> ذخیرهٔ وزن</button>
          </form>
          <div className="weight-guidance"><Activity size={15} /><span>روند تدریجی اطلاعات مفیدتری از تغییر سریع عدد ترازو می‌دهد.</span></div>
        </div>
      </section>

      <section className="panel-card records-panel">
        <div className="card-topline"><div><span className="eyebrow">بهترین عملکردها</span><h2>قوی‌ترین ست‌های ثبت‌شده.</h2></div><Trophy size={18} className="icon-accent" /></div>
        {records.length ? <div className="record-list">{records.map(({ exercise, best }) => best && <div className="record-list-row" key={exercise.id}><span className="record-trophy"><Trophy size={15} /></span><div><strong>{exercise.name}</strong><small>بهترین ست ثبت‌شده</small></div><b>{kg(best.weightKg)} <small>× {faNumber(best.reps)}</small></b></div>)}</div> : <EmptyState title="هنوز رکوردی ثبت نشده" detail="پس از ثبت تمرین‌ها، قوی‌ترین ست هر حرکت اینجا نمایش داده می‌شود." />}
      </section>

      <section className="panel-card workout-history-panel">
        <div className="section-heading"><div><span className="eyebrow">گزارش جلسه‌ها</span><h2>سوابق تمرین</h2></div><span className="small-count">{faNumber(completedSessions.length)} جلسه</span></div>
        {completedSessions.length ? (
          <div className="session-history-list">
            {completedSessions.map((session) => {
              const totals = getSessionTotals(session);
              const workoutName = getWorkoutTemplate(session.templateId)?.name ?? session.name;
              return (
                <details className="session-history-disclosure" key={session.id}>
                  <summary className="session-history-row">
                    <span className="session-history-mark"><Activity size={16} /></span>
                    <span className="session-history-main"><strong>{workoutName}</strong><small>{formatDate(session.startedAt, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatDuration(totals.durationSeconds)}</small></span>
                    <span className="session-history-stats">{faNumber(totals.setCount)} ست <i /> {faNumber(Math.round(totals.volumeKg))} کیلوگرم·تکرار</span>
                    <ChevronDown size={16} className="session-history-chevron" />
                  </summary>
                  <div className="session-history-detail">
                    {session.exercises.filter((item) => item.sets.length > 0).map((item) => (
                      <div className="session-history-exercise" key={item.exerciseId}>
                        <strong>{programExerciseName(item.exerciseId) ?? exercises.find((exercise) => exercise.id === item.exerciseId)?.name ?? item.exerciseId}</strong>
                        <div>{item.sets.map((set) => <span key={set.setNumber}>ست {faNumber(set.setNumber)}: {kg(set.weightKg)} × {faNumber(set.reps)} · {faNumber(set.rir)} تکرار در ذخیره{set.notes ? ` · ${set.notes}` : ''}</span>)}</div>
                      </div>
                    ))}
                    {session.notes && <p className="session-history-note"><strong>یادداشت جلسه</strong>{session.notes}</p>}
                  </div>
                </details>
              );
            })}
          </div>
        ) : <EmptyState title="سوابق تو با اولین جلسه شروع می‌شود" detail="تمرین‌های کامل‌شده، تعداد ست‌ها، مدت‌زمان و حجم اینجا جمع می‌شوند." action={<Link to="/program" className="inline-link">دیدن برنامه <ArrowRight size={14} /></Link>} />}
      </section>
    </div>
  );
}
