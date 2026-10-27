import type { ExerciseDefinition } from '../types';
import { adminPersonalProgram } from './adminProgram';

type GuideOverlay = Partial<Pick<ExerciseDefinition,
  'category' | 'primaryMuscles' | 'secondaryMuscles' | 'equipment' | 'setup' | 'startPosition' | 'execution' |
  'finishPosition' | 'breathing' | 'tempo' | 'commonMistakes' | 'safetyCues' | 'machineSetup'>>;
interface AdminGuideConfig { sourceId: string; overlay?: GuideOverlay; }

const guide = (sourceId: string, overlay?: GuideOverlay): AdminGuideConfig => ({ sourceId, overlay });

/**
 * Admin-plan movement IDs resolve to a complete teaching guide while remaining stable in
 * workout history. Existing catalogue IDs and stored session IDs are not rewritten.
 */
const ADMIN_GUIDES: Record<string, AdminGuideConfig> = {
  'admin-incline-machine-press': guide('incline-dumbbell-press', { setup: 'گزینهٔ دمبل: نیمکت را با شیب کم (حدود ۲۰ تا ۳۵ درجه) تنظیم کن. گزینهٔ دستگاه: صندلی را طوری بالا و پایین کن که دستگیره‌ها هم‌سطح بالاسینه باشند. در هر دو حالت بار سبک برای ست‌های آماده‌سازی انتخاب کن.' }),
  'admin-chest-press': guide('machine-chest-press'),
  'admin-pec-deck': guide('pec-deck', {
    category: 'Push', primaryMuscles: ['سینه'], secondaryMuscles: ['سرشانهٔ جلویی'], equipment: ['دستگاه پک‌دک'],
    setup: 'ارتفاع صندلی را طوری تنظیم کن که دسته‌ها یا پدها هم‌سطح میانهٔ سینه باشند. پشت و سر را به پشتی تکیه بده و وزنهٔ سبک انتخاب کن.',
    startPosition: 'بنشین، کف پاها روی زمین، آرنج‌ها کمی خم و هم‌سطح شانه؛ شانه‌ها را پایین و آرام نگه دار.',
    execution: ['با حفظ خم ملایم آرنج‌ها، دستگیره‌ها را در یک قوس رو به جلوی سینه بیاور.', 'در جلو مکث کوتاهی کن و سینه را منقبض کن؛ شانه‌ها را بالا نده.', 'دست‌ها را آهسته باز کن تا کشش ملایم سینه حس شود؛ دامنه را با کنترل مفصل شانه تنظیم کن.'],
    finishPosition: 'دست‌ها جلو و نزدیک هم، قفسهٔ سینه ثابت و شانه‌ها پایین؛ سپس با کنترل به شروع برگرد.',
    breathing: 'هنگام بستن دست‌ها بازدم و هنگام بازکردن دم.', tempo: '۲ ثانیه بستن، مکث کوتاه، ۲ تا ۳ ثانیه برگشت.',
    commonMistakes: ['بازکردن بیش از حد دست‌ها و کشش دردناک شانه', 'صاف یا قفل‌کردن آرنج‌ها', 'جداشدن پشت از پشتی یا ضربه‌زدن وزنه'],
    safetyCues: ['دامنهٔ بدون درد را انتخاب کن و وزنه را آهسته رها کن.', 'اگر شانه درد تیز دارد، حرکت را متوقف کن.'],
    machineSetup: { title: 'تنظیم دستگاه', points: ['صندلی را طوری تنظیم کن که دسته‌ها روبه‌روی سینه باشند.', 'محور حرکت دستگاه را نزدیک خط مفصل شانه قرار بده.', 'پیش از شروع، مسیر وزنه و پین انتخاب وزنه را بررسی کن.'] },
  }),
  'admin-machine-shoulder-press': guide('machine-shoulder-press', { setup: 'صندلی یا نیمکت دستگاه را طوری تنظیم کن که دستگیره‌ها در شروع کنار شانه باشند. اگر دستگاه اسمیت است، ضامن‌های ایمنی را قبل از شروع تنظیم کن.' }),
  'admin-lateral-raise': guide('machine-lateral-raise', { setup: 'گزینهٔ دستگاه: صندلی را تنظیم کن تا محور دستگاه با شانه هم‌راستا باشد. گزینهٔ کابل: قرقره را پایین بگذار و کنار دستگاه بایست. در هر دو حالت وزنهٔ سبک بردار و آرنج را کمی خم نگه دار.' }),
  'admin-triceps-pushdown': guide('rope-triceps-pushdown'),
  'admin-overhead-triceps': guide('overhead-cable-triceps-extension'),
  'admin-lat-pulldown': guide('lat-pulldown'),
  'admin-seated-row': guide('seated-cable-row'),
  'admin-tbar-row': guide('machine-row', { setup: 'برای دستگاه تی‌بار یا روئینگ سینه‌تکیه‌دار، ارتفاع سینه‌تکیه‌گاه و جای پا را تنظیم کن؛ سینه با پد تماس داشته باشد. اگر دستگاه تکیه‌گاه ندارد، تنه را ثابت و ستون فقرات را خنثی نگه دار.' }),
  'admin-cable-pullover': guide('cable-pullover', {
    category: 'Pull', primaryMuscles: ['زیربغل'], secondaryMuscles: ['عضلات مرکزی', 'پشت بازو'], equipment: ['سیم‌کش از بالا', 'میلهٔ صاف یا طناب'],
    setup: 'قرقره را در بالاترین نقطه بگذار و میلهٔ صاف یا طناب وصل کن. رو به دستگاه بایست و یک گام عقب برو تا کابل کشیده بماند.',
    startPosition: 'پاها به عرض لگن، زانو نرم، تنه کمی از مفصل لگن متمایل؛ دست‌ها جلو و بالاتر از سر با آرنج کمی خم.',
    execution: ['با ثابت نگه‌داشتن زاویهٔ آرنج، دست‌ها را در قوسی کنترل‌شده به سمت ران‌ها پایین ببر.', 'در کنار ران‌ها مکث کن و زیربغل را منقبض کن؛ کمر را گود نکن.', 'دست‌ها را آهسته به نقطهٔ شروع برگردان تا کشش زیربغل را حس کنی.'],
    finishPosition: 'دست‌ها روبه‌روی ران و تنه ثابت؛ بازگشت به شروع بدون تاب‌دادن بدن.',
    breathing: 'هنگام پایین‌کشیدن بازدم و هنگام برگشت دم.', tempo: '۲ ثانیه پایین، مکث کوتاه، ۲ تا ۳ ثانیه بالا.',
    commonMistakes: ['خم‌و‌راست‌کردن آرنج مثل حرکت پشت‌بازو', 'تاب‌دادن تنه یا تبدیل حرکت به لت‌پول‌داون', 'قوس‌دادن کمر برای پایین‌بردن وزنه'],
    safetyCues: ['وزنه باید اجازه دهد آرنج و تنه ثابت بمانند.', 'دامنه را تا جایی برو که شانه بدون درد و کنترل‌شده باشد.'],
  }),
  'admin-preacher-curl': guide('machine-preacher-curl'),
  'admin-hammer-curl': guide('hammer-curl', { setup: 'دمبل یا طناب سیم‌کش را با گرفتن خنثی (کف دست‌ها رو به هم) بگیر. کنار دستگاه بایست یا بنشین و آرنج‌ها را نزدیک پهلو نگه دار.' }),
  'admin-reverse-curl': guide('reverse-curl', {
    category: 'Pull', primaryMuscles: ['ساعد'], secondaryMuscles: ['بازو دوسر'], equipment: ['میلهٔ EZ یا هالتر سبک'],
    setup: 'میلهٔ EZ سبک را با گرفتن رو به پایین (کف دست به سمت زمین) بگیر؛ مچ‌ها صاف و آرنج‌ها کنار پهلو باشند.',
    startPosition: 'ایستاده، شکم کمی منقبض، بازوها کشیده و میله جلوی ران؛ مچ را در امتداد ساعد نگه دار.',
    execution: ['با خم‌کردن آرنج، میله را به سمت سینه بالا بیاور؛ بازوها کنار بدن بمانند.', 'در بالا مکث کوتاه کن، بدون آنکه مچ‌ها خم یا شانه‌ها بالا بیایند.', 'میله را آهسته تا نزدیک صاف‌شدن آرنج پایین بیاور.'],
    finishPosition: 'میله جلوی ران، مچ صاف و بدن بدون تاب.',
    breathing: 'هنگام بالا‌بردن بازدم و هنگام پایین‌آوردن دم.', tempo: '۲ ثانیه بالا، مکث کوتاه، ۲ تا ۳ ثانیه پایین.',
    commonMistakes: ['تاب‌دادن کمر برای بالا آوردن وزنه', 'خم‌کردن مچ به جلو یا عقب', 'استفاده از وزنه‌ای که آرنج را جلو می‌برد'],
    safetyCues: ['با وزنهٔ سبک شروع کن؛ گرفتن برعکس می‌تواند مچ را زود خسته کند.', 'در صورت درد مچ، حرکت را متوقف و از گرفتن راحت‌تر استفاده کن.'],
  }),
  'admin-leg-press': guide('leg-press'),
  'admin-leg-extension': guide('leg-extension'),
  'admin-leg-curl': guide('leg-curl', {
    setup: 'گزینهٔ نشسته: محور دستگاه را با زانو هم‌راستا و پد ران را محکم تنظیم کن. گزینهٔ خوابیده: محور دستگاه را نزدیک زانو قرار بده و پد را بالای پاشنه تنظیم کن. قبل از ست، دامنه را بدون وزنه بررسی کن.',
    startPosition: 'روی دستگاه انتخابی قرار بگیر؛ لگن و تنه به تکیه‌گاه بچسبد، زانو هم‌راستای محور و پاها زیر پد باشد.',
    execution: ['با خم‌کردن زانوها، پد را به‌آرامی به سمت پایین (دستگاه خوابیده) یا زیر صندلی (دستگاه نشسته) بکش.', 'در جمع‌شدگی همسترینگ مکث کوتاه کن؛ لگن را از پد جدا نکن.', 'پاها را آهسته تا کشش راحت برگردان و زانو را ضربه‌ای قفل نکن.'],
    finishPosition: 'زانوها خم و همسترینگ منقبض؛ برگشت به شروع با کنترل کامل وزنه.',
  }),
  'admin-hack-squat': guide('smith-squat', { setup: 'اگر اسمیت را انتخاب می‌کنی، میله را در ارتفاع مناسب تنظیم و ضامن‌های ایمنی را حتماً قفل کن. اگر هاک‌اسکوات است، پشتی و جای پا را تنظیم کن و قفل‌های دستگاه را قبل از شروع بررسی کن.' }),
  'admin-standing-calf-raise': guide('standing-calf-raise'),
  'admin-back-extension': guide('back-extension', {
    category: 'Legs', primaryMuscles: ['فیلهٔ کمر', 'عضلات سرینی'], secondaryMuscles: ['همسترینگ'], equipment: ['دستگاه هایپراکستنشن'],
    setup: 'پد دستگاه را کمی پایین‌تر از چین لگن تنظیم کن تا لگن بتواند آزادانه خم شود. پاها را محکم زیر نگهدارنده قفل و ارتفاع را پیش از شروع بررسی کن.',
    startPosition: 'بدن در یک خط از سر تا لگن، شکم کمی منقبض و دست‌ها روی سینه یا کنار سر؛ گردن خنثی.',
    execution: ['از مفصل لگن آرام خم شو و تنه را تا جایی پایین بیاور که کمر همچنان خنثی بماند.', 'در پایین مکث کوتاه کن؛ اجازه نده کمر گرد یا بیش‌ازحد باز شود.', 'با فشار باسن و همسترینگ تنه را تا هم‌راستایی با پاها بالا بیاور؛ از عقب‌بردن بیش‌ازحد تنه خودداری کن.'],
    finishPosition: 'بدن در خط مستقیم و باسن منقبض؛ بدون قوس‌دادن کمر در انتهای حرکت.',
    breathing: 'هنگام پایین‌رفتن دم و هنگام بالا‌آمدن بازدم.', tempo: '۲ تا ۳ ثانیه پایین، مکث کنترل‌شده، ۱ تا ۲ ثانیه بالا.',
    commonMistakes: ['بالاآمدن بیش‌ازحد و قوس‌دادن کمر', 'حرکت سریع و استفاده از تاب', 'قرارگیری پد روی شکم به‌جای زیر لگن'],
    safetyCues: ['ابتدا بدون وزنه یا با وزنهٔ بسیار سبک تمرین کن.', 'اگر درد تیرکشندهٔ کمر داری حرکت را انجام نده و ارزیابی تخصصی بگیر.'],
  }),
  'admin-hanging-leg-raise': guide('hanging-leg-raise'),
  'admin-cable-woodchop': guide('cable-woodchop', {
    category: 'Core', primaryMuscles: ['عضلات مورب شکمی'], secondaryMuscles: ['عضلات مرکزی', 'سرینی'], equipment: ['سیم‌کش', 'دستگیرهٔ تکی'],
    setup: 'قرقره را در ارتفاع بالای شانه تنظیم کن و دستگیرهٔ تکی را وصل کن. کنار دستگاه بایست، پاها را ثابت و دستگیره را با هر دو دست بگیر.',
    startPosition: 'دست‌ها نزدیک شانهٔ دور از دستگاه، لگن و زانو کمی نرم، شکم منقبض و تنه بلند.',
    execution: ['با کنترل تنه را مورب به سمت لگن مقابل بچرخان؛ حرکت از تنه و شانه‌ها باشد، نه کشیدن دست‌ها تنها.', 'در انتهای دامنه مکث کوتاه کن و لگن را رو به جلو نگه دار.', 'به‌آرامی به نقطهٔ شروع برگرد و همهٔ تکرارها را کامل کن؛ سپس سمت دیگر را انجام بده.'],
    finishPosition: 'دست‌ها کنار لگن مقابل، ستون فقرات خنثی و زانوها هم‌راستا با پنجه.',
    breathing: 'هنگام کشیدن کابل بازدم و هنگام برگشت دم.', tempo: '۲ ثانیه چرخش، مکث کوتاه، ۲ ثانیه برگشت.',
    commonMistakes: ['چرخاندن یا خم‌کردن بیش‌ازحد کمر', 'قفل‌کردن زانو و تاب‌دادن دست‌ها', 'چرخاندن پاها و از دست‌دادن تعادل'],
    safetyCues: ['وزنه را سبک انتخاب کن و حرکت را بدون درد انجام بده.', 'برای هر سمت تعداد تکرار برابر بزن.'],
  }),
  'admin-neutral-pulldown': guide('neutral-grip-lat-pulldown'),
  'admin-one-arm-row': guide('one-arm-dumbbell-row', { setup: 'گزینهٔ دمبل: یک دست و زانو را روی نیمکت ثابت کن. گزینهٔ دستگاه: سینه را به پد تکیه بده و دستگیرهٔ تک‌دست را در ارتفاع مناسب بگیر. در هر دو حالت لگن و شانه‌ها رو به زمین بمانند.' }),
  'admin-incline-press': guide('incline-dumbbell-press', { setup: 'برای دمبل، نیمکت را با شیب کم تنظیم کن؛ برای اسمیت، نیمکت را زیر میله بگذار و ضامن‌ها را پیش از برداشتن وزنه تنظیم کن. در هر دو حالت، بالاسینه زیر مسیر فشار باشد.' }),
  'admin-face-pull': guide('face-pull', {
    setup: 'گزینهٔ فیس‌پول: طناب سیم‌کش را در ارتفاع صورت تنظیم کن. گزینهٔ فلای معکوس: روی دستگاه پک‌دک معکوس بنشین و دسته‌ها را در سطح شانه بگیر. برای هر دو، وزنهٔ سبک و گردن خنثی انتخاب کن.',
    startPosition: 'برای فیس‌پول بایست و طناب را با دو دست بگیر؛ برای فلای معکوس بنشین و سینه را به پد تکیه بده. شانه‌ها پایین و آرنج‌ها نرم.',
    execution: ['فیس‌پول: طناب را به سمت دو طرف صورت بکش؛ فلای معکوس: دستگیره‌ها را در قوس افقی به طرفین باز کن.', 'در پایان کتف‌ها را آرام به هم نزدیک کن و شانه‌ها را بالا نده.', 'به‌آرامی دست‌ها را به شروع برگردان و کشش را کنترل کن.'],
    finishPosition: 'دست‌ها در شروع و شانه‌ها پایین؛ تنه ثابت و بدون تاب.',
  }),
  'admin-single-arm-lateral': guide('cable-lateral-raise'),
  'admin-cable-curl': guide('cable-curl'),
  'admin-machine-dip': guide('machine-dip', {
    category: 'Push', primaryMuscles: ['پشت بازو'], secondaryMuscles: ['سینه', 'سرشانهٔ جلویی'], equipment: ['دستگاه دیپ نشسته'],
    setup: 'ارتفاع صندلی و دسته‌ها را تنظیم کن تا شانه‌ها راحت باشند. اگر دستگاه پد کمکی دارد، وزن کمک را طوری انتخاب کن که حرکت کنترل شود.',
    startPosition: 'بنشین و دستگیره‌ها را بگیر؛ آرنج‌ها خم و نزدیک بدن، سینه آرام و شانه‌ها پایین.',
    execution: ['دستگیره‌ها را با فشار پشت بازو به پایین ببر تا آرنج‌ها تقریباً صاف شوند.', 'در پایین مکث کوتاهی کن و آرنج‌ها را قفل نکن.', 'وزنه را آهسته بالا بیاور تا آرنج به زاویهٔ راحت برگردد؛ شانه را بالا نکش.'],
    finishPosition: 'آرنج‌ها کمی خم، دستگیره‌ها کنترل‌شده و شانه‌ها پایین.',
    breathing: 'هنگام فشار به پایین بازدم و هنگام برگشت دم.', tempo: '۱ تا ۲ ثانیه پایین، مکث کوتاه، ۲ تا ۳ ثانیه برگشت.',
    commonMistakes: ['بازشدن آرنج‌ها به طرفین', 'بالاانداختن شانه‌ها', 'قفل‌کردن آرنج یا رهاکردن وزنه'],
    safetyCues: ['دامنهٔ بدون درد شانه را انتخاب کن.', 'اگر دستگاه از نوع دیپ با وزن بدن است، کمک یا وزنهٔ مناسب انتخاب کن و فقط در صورت کنترل کامل اجرا کن.'],
  }),
  'admin-shrug': guide('machine-shrug', {
    category: 'Pull', primaryMuscles: ['ذوزنقه'], secondaryMuscles: ['سرشانهٔ پشتی'], equipment: ['دستگاه شراگ یا دمبل'],
    setup: 'دستگاه را با ارتفاع مناسب تنظیم کن یا دمبل‌های سبک بردار. پاها ثابت و گردن در امتداد ستون فقرات باشد.',
    startPosition: 'دست‌ها کنار بدن، بازوها تقریباً صاف و شانه‌ها رها؛ تنه بلند و بدون قوس.',
    execution: ['شانه‌ها را مستقیم به سمت گوش بالا ببر؛ آرنج را خم نکن.', 'در بالا یک لحظه مکث کن و ذوزنقه را منقبض کن.', 'شانه‌ها را آرام پایین بیاور تا کشش کنترل‌شده حس شود.'],
    finishPosition: 'شانه‌ها پایین و دست‌ها کنار بدن؛ سر و گردن خنثی.',
    breathing: 'هنگام بالا بردن شانه‌ها بازدم و هنگام پایین‌آوردن دم.', tempo: '۱ تا ۲ ثانیه بالا، مکث کوتاه، ۲ ثانیه پایین.',
    commonMistakes: ['چرخاندن شانه‌ها به عقب یا جلو', 'خم‌کردن آرنج و تبدیل حرکت به روئینگ', 'قوس‌دادن گردن یا تاب‌دادن بدن'],
    safetyCues: ['وزنه را طوری انتخاب کن که شانه‌ها مستقیم بالا و پایین بروند.', 'گردن را فشار نده و در صورت درد گردن حرکت را متوقف کن.'],
  }),
  'admin-smith-squat': guide('smith-squat'),
  'admin-lunge': guide('dumbbell-lunge', {
    category: 'Legs', primaryMuscles: ['چهارسر ران', 'عضلات سرینی'], secondaryMuscles: ['همسترینگ', 'عضلات مرکزی'], equipment: ['دمبل یا وزن بدن', 'فضای آزاد'],
    setup: 'در فضای باز بایست و یک گام بلند به جلو بردار؛ برای دمبل، اول بدون وزنه تعادل را تمرین کن. گزینهٔ جایگزین: پرس پا تک‌پا، با صندلی و دامنهٔ راحت.',
    startPosition: 'پاها روی دو ریل موازی لگن، تنه بلند، شکم منقبض و وزن بدن بین دو پا متعادل.',
    execution: ['لانج: یک گام کنترل‌شده بردار و تنه را بلند نگه دار. پرس تک‌پا: یک پا را روی صفحه و پای دیگر را کنار دستگاه امن قرار بده.', 'لانج: زانوی عقب را به سمت زمین پایین بیاور و زانوی جلو را هم‌راستای پنجه نگه دار. پرس تک‌پا: قفل را آزاد کن و صفحه را فقط تا دامنهٔ راحت پایین بیاور.', 'لانج: با فشار پای جلو به ایستادن برگرد و بعد از تکرارها پا را عوض کن. پرس: صفحه را از پاشنهٔ پای کار فشار بده و زانو را ضربه‌ای قفل نکن.'], 
    finishPosition: 'ایستاده و متعادل، لگن رو به جلو و زانوها بدون قفل‌شدن.',
    breathing: 'هنگام پایین‌رفتن دم و هنگام بالا‌آمدن بازدم.', tempo: '۲ تا ۳ ثانیه پایین، مکث کوتاه، ۱ تا 2 ثانیه بالا.',
    commonMistakes: ['گام خیلی کوتاه و فشار زیاد روی زانوی جلو', 'فروریختن زانو به داخل', 'از دست‌دادن تعادل یا هل‌دادن با پای عقب'],
    safetyCues: ['ابتدا کنار تکیه‌گاه ثابت و بدون وزنه تمرین کن.', 'اگر زانو درد دارد، دامنه را کم کن یا گزینهٔ پرس پا تک‌پا را انتخاب کن.'],
  }),
  'admin-seated-leg-curl': guide('leg-curl'),
  'admin-seated-calf-raise': guide('seated-calf-raise'),
  'admin-dumbbell-lateral': guide('lateral-raise'),
  'admin-rear-delt-fly': guide('reverse-fly'),
  'admin-reverse-crunch': guide('reverse-crunch', {
    category: 'Core', primaryMuscles: ['عضلات شکم'], secondaryMuscles: ['خم‌کننده‌های لگن'], equipment: ['نیمکت صاف'],
    setup: 'روی نیمکت دراز بکش و لبهٔ آن را پشت سر بگیر تا ثابت بمانی. اگر نیمکت نداری، روی زمین و روی تشک اجرا کن.',
    startPosition: 'زانوها خم و پاها کنار هم؛ کمر را آرام به نیمکت نزدیک کن و شکم را منقبض نگه دار.',
    execution: ['با جمع‌کردن شکم، زانوها را به سمت سینه بیاور.', 'در انتهای حرکت لگن را کمی از نیمکت جدا کن؛ از تاب‌دادن پاها کمک نگیر.', 'پاها را آهسته پایین بیاور تا کمر از کنترل خارج نشود؛ پاها را روی زمین رها نکن.'],
    finishPosition: 'زانوها خم و لگن کنترل‌شده روی نیمکت؛ کمر بدون قوس اضافه.',
    breathing: 'هنگام جمع‌کردن زانوها بازدم و هنگام پایین‌بردن دم.', tempo: '۲ ثانیه بالا، مکث کوتاه، ۲ تا ۳ ثانیه پایین.',
    commonMistakes: ['تاب‌دادن پاها', 'قوس‌دادن کمر هنگام پایین‌آمدن', 'کشیدن زانو با دست یا فشار گردن'],
    safetyCues: ['دامنه را طوری تنظیم کن که کمر کنترل شود.', 'اگر درد کمر داری حرکت را متوقف کن.'],
  }),
  'admin-woodchop': guide('cable-crunch'),
  'admin-plank': guide('plank', {
    category: 'Core', primaryMuscles: ['عضلات مرکزی'], secondaryMuscles: ['سرینی', 'سرشانه'], equipment: ['تشک تمرین'],
    setup: 'روی تشک قرار بگیر. برای پلانک ساعدی، آرنج‌ها را زیر شانه بگذار؛ گزینهٔ آسان‌تر پلانک روی دست یا زانو است.',
    startPosition: 'پاها را عقب ببر و بدن را از سر تا پاشنه در یک خط نگه دار؛ شکم و باسن را منقبض کن.',
    execution: ['به زمین نگاه کن و گردن را در امتداد ستون فقرات نگه دار.', 'بدون حبس نفس، شکم و باسن را منقبض و لگن را ثابت نگه دار.', 'تا زمان تعیین‌شده فرم را حفظ کن؛ اگر کمر افتاد، زانوها را زمین بگذار یا ست را تمام کن.'],
    finishPosition: 'زانوها را آرام روی زمین بگذار و از وضعیت پلانک خارج شو.',
    breathing: 'طبیعی و پیوسته نفس بکش؛ نفس را حبس نکن.', tempo: 'نگه‌داری ایزومتریک ۴۰ تا ۶۰ ثانیه با فرم ثابت.',
    commonMistakes: ['افتادن لگن یا بالا بردن بیش‌ازحد آن', 'حبس نفس', 'بالاانداختن شانه‌ها و قفل‌کردن آرنج'],
    safetyCues: ['کیفیت فرم از طول زمان مهم‌تر است؛ با افت فرم استراحت کن.', 'اگر درد کمر یا شانه ایجاد شد حرکت را متوقف کن.'],
  }),
};

// Both plan days perform the same cable woodchop technique.
ADMIN_GUIDES['admin-woodchop'] = { ...ADMIN_GUIDES['admin-cable-woodchop']!, sourceId: 'cable-woodchop' };

export function getAdminExerciseGuide(
  exerciseId: string,
  lookup: (id: string) => ExerciseDefinition | undefined,
): ExerciseDefinition | undefined {
  const config = ADMIN_GUIDES[exerciseId];
  if (!config) return undefined;
  const source = lookup(config.sourceId);
  if (!source) return undefined;
  const programEntry = adminPersonalProgram.flatMap((day) => day.exercises).find((item) => item.exerciseId === exerciseId);
  const merged: ExerciseDefinition = {
    ...source,
    ...config.overlay,
    id: exerciseId,
    name: programEntry?.name ?? source.name,
    englishName: source.englishName ?? source.name,
  };
  merged.movementPhases = [
    { label: 'آماده‌سازی', instruction: merged.startPosition },
    { label: 'شروع حرکت', instruction: merged.execution[0] ?? merged.startPosition },
    { label: 'کنترل و مکث', instruction: merged.execution[1] ?? merged.execution[0] ?? merged.startPosition },
    { label: 'بازگشت', instruction: merged.execution[2] ?? merged.finishPosition },
    { label: 'پایان', instruction: merged.finishPosition },
  ];
  return merged;
}

export const adminExerciseCatalogId = (exerciseId: string): string | undefined => ADMIN_GUIDES[exerciseId]?.sourceId;

const ADMIN_VISUAL_IDS: Record<string, string> = {
  'admin-pec-deck': 'cable-fly',
  'admin-machine-shoulder-press': 'smith-shoulder-press',
  'admin-cable-pullover': 'lat-pulldown',
  'admin-reverse-curl': 'ez-bar-curl',
  'admin-back-extension': 'romanian-deadlift',
  'admin-cable-woodchop': 'cable-crunch',
  'admin-woodchop': 'cable-crunch',
  'admin-machine-dip': 'machine-triceps-extension',
  'admin-shrug': 'machine-row',
  'admin-lunge': 'bulgarian-split-squat',
};

export const adminExerciseVisualId = (exerciseId: string): string | undefined => ADMIN_VISUAL_IDS[exerciseId] ?? adminExerciseCatalogId(exerciseId);
