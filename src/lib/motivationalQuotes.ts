import { useState } from 'react';

/**
 * Dynamic Motivational Quotes Engine
 * Delivers varied, non-repeating fitness and mindset insights across app sessions.
 * Never displays a static quote and tracks history in localStorage to avoid repetition.
 */

export interface MotivationalQuote {
  id: string;
  title: string;
  subtitle: string;
  category?: 'discipline' | 'consistency' | 'strength' | 'recovery' | 'mindset';
}

export const MOTIVATIONAL_QUOTES: MotivationalQuote[] = [
  {
    id: 'quote-01',
    title: 'با هدف تمرین کن.',
    subtitle: 'پیشرفت واقعی حاصل قدم‌های کوچک اما هر روزه است.',
    category: 'consistency',
  },
  {
    id: 'quote-02',
    title: 'انضباط، پلی میان هدف و واقعیت است.',
    subtitle: 'انگیزه تو را شروع می‌کند، اما انضباط تو را ادامه می‌دهد.',
    category: 'discipline',
  },
  {
    id: 'quote-03',
    title: 'پیوستگی راز تسلط است.',
    subtitle: 'یک جلسه معمولی امروز، بهتر از یک جلسه بی‌نقصِ فرداست.',
    category: 'consistency',
  },
  {
    id: 'quote-04',
    title: 'روزهای سخت، شخصیت تو را می‌سازند.',
    subtitle: 'وقتی انگیزه نداری و با این حال تمرین می‌کنی، برنده شدی.',
    category: 'mindset',
  },
  {
    id: 'quote-05',
    title: 'قدرت در سکوت ساخته می‌شود.',
    subtitle: 'عضله به فشار زمان واکنش نشان می‌دهد، نه به هیاهو.',
    category: 'strength',
  },
  {
    id: 'quote-06',
    title: 'ریکاوری، نیمی از نتیجه است.',
    subtitle: 'خواب عمیق و تغذیه سالم، ست‌های سخت باشگاه را به عضله تبدیل می‌کنند.',
    category: 'recovery',
  },
  {
    id: 'quote-07',
    title: 'حضور پیدا کن، بعد پیشرفت کن.',
    subtitle: 'سخت‌ترین بخش تمرین، رد شدن از درِ باشگاه است.',
    category: 'consistency',
  },
  {
    id: 'quote-08',
    title: 'آهسته اما پیوسته.',
    subtitle: 'یک تکرار یا نیم‌کیلو افزایش وزنه در هر ماه، در یک سال معجزه می‌کند.',
    category: 'strength',
  },
  {
    id: 'quote-09',
    title: 'تمرکز بر تکنیک، ضامن طول عمر ورزشی است.',
    subtitle: 'وزنهٔ سنگین با فرم خراب فقط غرور است؛ فرم بی‌نقص عضله می‌سازد.',
    category: 'strength',
  },
  {
    id: 'quote-10',
    title: 'به فرآیند اعتماد کن.',
    subtitle: 'تغییرات در آینه بلافاصله دیده نمی‌شوند، اما در سطح سلولی آغاز شده‌اند.',
    category: 'mindset',
  },
  {
    id: 'quote-11',
    title: 'تکرار آخر، نقطه تمایز است.',
    subtitle: 'رشد دقیقاً همان جایی شروع می‌شود که ذهن می‌خواهد متوقف شوی.',
    category: 'strength',
  },
  {
    id: 'quote-12',
    title: 'ذهنت را قوی‌تر از بهانه‌هایت بساز.',
    subtitle: 'هوا سرد است، خسته‌ای یا وقت کمه؟ یک جنگجوی بااراده راهش را پیدا می‌کند.',
    category: 'discipline',
  },
  {
    id: 'quote-13',
    title: 'بدن تو، خانه همیشگی توست.',
    subtitle: 'با تمرین درست و سوخت پاک، به گران‌بهاترین دارایی‌ات احترام بگذار.',
    category: 'mindset',
  },
  {
    id: 'quote-14',
    title: 'مقایسه فقط با دیروز خودت.',
    subtitle: 'هر کس فصل متفاوتی از سفر بدنی خود را طی می‌کند؛ مسیر خودت را برو.',
    category: 'mindset',
  },
  {
    id: 'quote-15',
    title: 'شتاب‌زدگی دشمن نتایج ماندگار است.',
    subtitle: 'عضلاتی که آرام و بر پایه اصول ساخته شوند، سال‌ها همراهت خواهند ماند.',
    category: 'consistency',
  },
  {
    id: 'quote-16',
    title: 'تنفس عمیق، تمرکز کامل.',
    subtitle: 'ارتباط عصب و عضله در هر ست، تفاوت بین جابجا کردن وزنه و ساختن عضله است.',
    category: 'strength',
  },
  {
    id: 'quote-17',
    title: 'هیچ کوششی بی‌حاصل نمی‌ماند.',
    subtitle: 'عرق امروز، اعتماد به نفس و نشاط فردای توست.',
    category: 'mindset',
  },
  {
    id: 'quote-18',
    title: 'به ندای بدنت گوش بسپار.',
    subtitle: 'خستگی عضلانی را با درد مفصلی اشتباه نگیر؛ هوشمندانه تمرین کن.',
    category: 'recovery',
  },
  {
    id: 'quote-19',
    title: 'فردا از تلاشی که امروز کردی سپاسگزار خواهی بود.',
    subtitle: 'حتی یک تمرین ۲۰ دقیقه‌ای از نشستن روی مبل بی‌شمار بار بهتر است.',
    category: 'consistency',
  },
  {
    id: 'quote-20',
    title: 'عادت‌ها سرنوشت جسم تو را می‌نویسند.',
    subtitle: 'تکرار کارهای درست در هر روز، موفقیتی اجتناب‌ناپذیر رقم می‌زند.',
    category: 'discipline',
  },
  {
    id: 'quote-21',
    title: 'پیروزی از غلبه بر خستگی آغاز می‌شود.',
    subtitle: 'آنجا که همه تسلیم می‌شوند، یک تکرار بیشتر بزن.',
    category: 'strength',
  },
  {
    id: 'quote-22',
    title: 'آب کافی، سوخت پنهان سلول‌ها.',
    subtitle: 'هیدراتاسیون مناسب تا ۱۵ درصد عملکرد و استقامت عضلانی را بالا می‌برد.',
    category: 'recovery',
  },
  {
    id: 'quote-23',
    title: 'انعطاف‌پذیری، مکمل قدرت است.',
    subtitle: 'کشش و موبیلیتی مفاصل را جدی بگیر تا همیشه بدون درد تمرین کنی.',
    category: 'recovery',
  },
  {
    id: 'quote-24',
    title: 'هر جلسه یک اثر هنری است.',
    subtitle: 'با تمرکز، نظم و تعهد میله را لمس کن و به تک‌تک ثانیه‌ها معنا ببخش.',
    category: 'mindset',
  },
  {
    id: 'quote-25',
    title: 'سخت‌ترین مبارزه، مبارزه با تنبلی درون است.',
    subtitle: 'وقتی بر وسوسه بهانه‌تراشی پیروز شوی، هیچ وزنه‌ای جلودارت نیست.',
    category: 'discipline',
  },
  {
    id: 'quote-26',
    title: 'پیشرفت خطی نیست، اما پیوسته است.',
    subtitle: 'گاهی توقف‌های کوتاه، مقدمه یک جهش رکورد بزرگ در ماه‌های آینده است.',
    category: 'consistency',
  },
  {
    id: 'quote-27',
    title: 'پروتئین باکیفیت، خشت‌های بازسازی بدن.',
    subtitle: 'عضلاتت در باشگاه تخریب می‌شوند؛ با تغذیهٔ هوشمندانه آن‌ها را بساز.',
    category: 'recovery',
  },
  {
    id: 'quote-28',
    title: 'غرور را پشت درِ سالن بگذار.',
    subtitle: 'حرکت را کامل و با مهار وزنه اجرا کن؛ احترام به بدن یعنی تمرین اصولی.',
    category: 'strength',
  },
  {
    id: 'quote-29',
    title: 'چالش‌ها فرصتی برای درخشش هستند.',
    subtitle: 'احساس سوزش در عضله، پیام ساختن مویرگ‌ها و فیبرهای تازه است.',
    category: 'mindset',
  },
  {
    id: 'quote-30',
    title: 'میراثی از تندرستی برای خودت بساز.',
    subtitle: 'تمرین امروزت، سرمایه‌گذاری برای شادابی و سلامت ۱۰ سال آینده توست.',
    category: 'mindset',
  },
];

const RECENT_QUOTES_KEY = 'meety.recent_quote_ids';
const MAX_HISTORY = 18;

function getRecentQuoteIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_QUOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentQuoteId(id: string): void {
  try {
    const current = getRecentQuoteIds();
    const updated = [id, ...current.filter((item) => item !== id)].slice(0, MAX_HISTORY);
    window.localStorage.setItem(RECENT_QUOTES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Returns a fresh, non-repeating motivational quote.
 * Never returns the same quote recently viewed.
 */
export function getFreshMotivationalQuote(category?: MotivationalQuote['category']): MotivationalQuote {
  let pool = category
    ? MOTIVATIONAL_QUOTES.filter((q) => q.category === category)
    : MOTIVATIONAL_QUOTES;

  if (pool.length === 0) pool = MOTIVATIONAL_QUOTES;

  if (typeof window === 'undefined') {
    return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]!;
  }

  const recent = getRecentQuoteIds();
  // Filter out recent quotes
  let candidates = pool.filter((q) => !recent.includes(q.id));

  // If all candidates in this pool were shown recently, take from the ones shown longest ago
  if (candidates.length === 0) {
    const oldest = recent.slice(Math.floor(MAX_HISTORY / 2));
    candidates = pool.filter((q) => oldest.includes(q.id));
    if (candidates.length === 0) candidates = pool;
  }

  // Pick random candidate
  const randomIndex = Math.floor(Math.random() * candidates.length);
  const selected = candidates[randomIndex] ?? pool[0]!;

  saveRecentQuoteId(selected.id);
  return selected;
}

/**
 * React hook to get a fresh, non-repeating motivational quote on component mount.
 */
export function useMotivationalQuote(category?: MotivationalQuote['category']): MotivationalQuote {
  // Use state initialized once on mount
  const [quote] = useState<MotivationalQuote>(() => getFreshMotivationalQuote(category));
  return quote;
}

