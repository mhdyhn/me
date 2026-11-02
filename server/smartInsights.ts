import type { Db } from './db.ts';
import { AI_SYSTEM_PROMPT, aiConfig, askAi, cleanAiText } from './ai.ts';
import { INACTIVE_DAYS, listInactiveStudents } from './coachReports.ts';

/**
 * The smart lines of the app.
 *
 * Every function here returns a Persian sentence with a source. The rule-based sentence is
 * always ready; when the club configures an AI endpoint, the same numbers are turned into
 * a better sentence. The user sees one text and never learns which one wrote it.
 */
export interface Insight {
  text: string;
  /** 'ai' when the model wrote it, 'rules' when the app did. */
  source: 'ai' | 'rules';
}

const THIRTY_DAYS = 30 * 86_400_000;

/** The sessions of an account live in two places; both are counted here. */
const SESSIONS_UNION = `
  SELECT started_at FROM workout_sessions WHERE student_id = $1
  UNION ALL
  SELECT p.body::jsonb->>'startedAt' FROM personal_data_records p
   WHERE p.user_id = $1 AND p.kind = 'session' AND p.deleted = 0 AND p.body::jsonb->>'startedAt' IS NOT NULL
`;

function fa(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

/**
 * The weekly line of a student: how much they trained and whether it is more or less
 * than the month before.
 */
export async function studentWeeklyInsight(db: Db, userId: number, now = new Date()): Promise<Insight> {
  const from = new Date(now.getTime() - THIRTY_DAYS).toISOString();
  const previousFrom = new Date(now.getTime() - 2 * THIRTY_DAYS).toISOString();
  const rows = await db.query<{ recent: string; previous: string }>(
    `WITH sessions AS (${SESSIONS_UNION})
     SELECT
       COUNT(*) FILTER (WHERE started_at >= $2)::text AS recent,
       COUNT(*) FILTER (WHERE started_at >= $3 AND started_at < $2)::text AS previous
     FROM sessions`,
    [userId, from, previousFrom]
  );
  const recent = Number(rows[0]?.recent ?? '0');
  const previous = Number(rows[0]?.previous ?? '0');
  const perWeek = recent / 4.3;
  const change = recent - previous;

  const rules = recent === 0
    ? 'در یک ماه گذشته جلسه‌ای تمرین ثبت نشده است؛ یک جلسهٔ سبک، بهترین شروع دوباره است.'
    : `در یک ماه گذشته ${fa(recent)} جلسه تمرین کرده‌اید (میانگین ${fa(Math.round(perWeek * 10) / 10)} جلسه در هفته)` +
      `${change === 0 ? '؛ همان روند ماه قبل ادامه دارد.' : change > 0 ? `؛ ${fa(change)} جلسه بیشتر از ماه قبل.` : `؛ ${fa(Math.abs(change))} جلسه کمتر از ماه قبل.`}`;
  const ruleText: Insight = { text: rules, source: 'rules' };

  const config = aiConfig();
  if (!config.enabled) return ruleText;
  const answer = await askAi(config, AI_SYSTEM_PROMPT,
    `این آمار تمرین یک شاگرد در ۳۰ روز گذشته است: ${fa(recent)} جلسه، میانگین ${fa(Math.round(perWeek * 10) / 10)} جلسه در هفته، و ${fa(Math.abs(change))} جلسه ${change >= 0 ? 'بیشتر' : 'کمتر'} از ۳۰ روز قبل. یک جملهٔ کوتاه تشویقی یا تحلیلی فارسی بنویس که به همین عددها اشاره کند.`);
  const text = cleanAiText(answer);
  return text ? { text, source: 'ai' } : ruleText;
}

/**
 * The line of the coach about the students who stopped training.
 *
 * The model only sees the numbers and anonymous labels; the names are put back afterwards,
 * so no name of a user leaves the club.
 */
export async function coachInactiveInsight(db: Db, coachId: number, now = new Date()): Promise<Insight> {
  const students = await listInactiveStudents(db, coachId, now);
  if (!students.length) {
    return { text: 'همهٔ شاگردها در دو هفتهٔ گذشته تمرین کرده‌اند؛ وضعیت خوب است.', source: 'rules' };
  }
  const days = students
    .map((student) => student.daysSinceLastSession ?? 0)
    .filter((value) => value > 0);
  const average = days.length ? Math.round(days.reduce((sum, value) => sum + value, 0) / days.length) : 0;
  const withoutProgramme = students.filter((student) => !student.hasProgramme).length;
  const never = students.filter((student) => student.daysSinceLastSession === null).length;

  const rules = `${fa(students.length)} شاگرد بیش از ${fa(INACTIVE_DAYS)} روز تمرین نکرده است` +
    (average ? `؛ میانگین ${fa(average)} روز از آخرین تمرین` : '') +
    (never ? `؛ ${fa(never)} نفر هنوز شروع نکرده‌اند` : '') +
    (withoutProgramme ? `؛ ${fa(withoutProgramme)} نفر برنامهٔ فعال ندارند` : '') +
    '. یک پیام کوتاه و بدون سرزنش بفرستید.';
  const ruleText: Insight = { text: rules, source: 'rules' };

  const config = aiConfig();
  if (!config.enabled) return ruleText;
  const labels = students.map((student, index) => ({
    label: `شاگرد ${fa(index + 1)}`,
    name: student.displayName,
    days: student.daysSinceLastSession,
    sessions: student.sessionsLast30Days,
    programme: student.hasProgramme,
  }));
  const details = labels
    .map((item) => `${item.label}: ${item.days === null ? 'تا حالا تمرین نکرده' : `${fa(item.days)} روز از آخرین تمرین`}، ${fa(item.sessions)} جلسه در ۳۰ روز گذشته${item.programme ? '' : '، بدون برنامهٔ فعال'}`)
    .join('\n');
  const answer = await askAi(config, AI_SYSTEM_PROMPT,
    `گزارش بی‌تمرینی گروه یک مربی (${fa(students.length)} شاگرد):\n${details}\nیک جمع‌بندی کوتاه فارسی در حد دو جمله بنویس که به مربی بگوید اول با چه کسی و چه کاری شروع کند.`);
  const cleaned = cleanAiText(answer);
  if (!cleaned) return ruleText;
  let text = cleaned;
  for (const item of labels) text = text.split(item.label).join(item.name);
  return { text, source: 'ai' };
}
