# موتور تمرین سه‌بعدی (`src/engine`)

این ماژول داده‌ی حرکت را از رندر جدا می‌کند. هسته‌ی `src/engine` به three.js یا React وابسته نیست؛ فقط TypeScript خالص است و در تست‌ها بدون مرورگر اجرا می‌شود.

```
Mobile App
  └─ Exercise Viewer        (src/engine-demo/EngineDemo.tsx، و در آینده صفحهٔ تمرین اپ)
       └─ Exercise Registry (src/engine/registry.ts)
            └─ Exercise Configuration (src/engine/schema.ts، src/engine/catalog.ts)
                 └─ 3D Character + Animation + Equipment
                      (src/motion/*، public/models/human.glb)
                       └─ Real-Time Renderer (src/components/ExerciseModelCanvas.tsx)
```

## تقسیم مسئولیت

| لایه | فایل‌ها | وابستگی |
| --- | --- | --- |
| اسکیما و خطا | `schema.ts`، `errors.ts` | هیچ |
| ثبت و بازیابی تمرین | `registry.ts` | اسکیما |
| پخش (ساعت، سرعت، حلقه، اسکراب) | `playback.ts` | اسکیما |
| دوربین (نماها، زوم، کران زوم) | `camera.ts` | اسکیما |
| عضلات (نگاشت ناحیه به عضله) | `muscles.ts` | اسکیما، `src/motion/muscles.ts` |
| بارگذاری مدل (کش، تلاش مجدد، تشخیص خطا) | `assets.ts` | `fetch` |
| تبدیل داده‌ی موجود به اسکیما | `catalog.ts` | `src/data`، `src/motion` |
| تشخیص قابلیت دستگاه | `device.ts` | هیچ |
| رندر لحظه‌ای | `src/components/ExerciseModelCanvas.tsx` | three.js (کد موجود) |

داده‌ی تمرین یک‌جا در `src/data/exercises.ts` و `src/data/exercisePersian.ts` است. `catalog.ts` فقط آن را به اسکیما تبدیل می‌کند؛ بنابراین برای هر تمرین یک منبع حقیقت وجود دارد.

## اسکیمای تمرین

هر پیکربندی (`EngineExerciseConfig`) شامل این بخش‌هاست:

- `schemaVersion` (فعلاً `1`)، `id` به شکل kebab-case، و `name` دوزبانه.
- `motion.id` (کلید در `src/motion/library.ts`)، `motion.durationSeconds`، `motion.phases` (`start`، `eccentric`، `main`، `concentric`).
- `model`: مسیر فایل (`/models/human.glb`) و نام rig (`makehuman-cc0`).
- `muscles`: عضله‌های اصلی و کمکی با ناحیه‌ی آناتومیک.
- `equipment`، `cameraViews`، `tempo`، `breathing`، `commonMistakes`، `safety`.
- `validation`: وضعیت (`unverified` / `visually-reviewed` / `numeric-checked`) و یادداشت.
- `sources` و `license` برای هر تمرین.

متن‌های رو به خواننده به شکل `{ fa, en }` هستند. اگر ترجمه‌ای نبود، `en` به‌جای آن نمایش داده می‌شود و هیچ‌وقت صفحه‌ی خالی نیست. `validateExerciseConfig` خطاها (مانع پذیرش) و هشدارها (فقط گزارش) را برمی‌گرداند.

## ثبت و بازیابی

```ts
import { createRegistry, appExerciseConfigs, appMotionIds, openExercise } from '../engine';

const registry = createRegistry(appExerciseConfigs(), { motionIds: appMotionIds() });
registry.report.accepted;   // پیکربندی‌های پذیرفته‌شده
registry.report.rejected;   // هر رد شده با دلیل

const result = registry.open('barbell-bench-press');
if (result.ok) {
  result.config;            // پیکربندی آمادهٔ نمایش
} else {
  result.error.message.fa;  // پیام خطای قابل نمایش
  result.error.retryable;   // آیا تلاش دوباره فایده دارد
}
```

تمرینی که حرکتش در کتابخانه نیست، در مرحلهٔ ثبت رد می‌شود و هرگز به نمایش نمی‌رسد. شناسه‌ها با `_` یا `-` هر دو پذیرفته می‌شوند (`barbell_bench_press` و `barbell-bench-press` یکی‌اند).

## پخش

`createPlayback` وضعیت پخش را نگه می‌دارد: `play`، `pause`، `restart`، `setSpeed`، `setLoop`، `seek`. سرعت‌های مجاز `0.5`، `0.75`، `1`، `1.25`، `1.5`، `2` هستند؛ مقدار دیگر `UnsupportedSpeedError` می‌دهد.

`stepPosition(position, seconds, speed, durationSeconds, loop)` همان منطق ساعت است که کانواس رندر هم از آن استفاده می‌کند. حالت حلقه و حالت یک‌بار اجرا را هر دو پوشش می‌دهد.

## دوربین و زوم

نماهای پیش‌فرض: `front`، `side`، `rear`، و `free` (چرخش آزاد). `ZOOM_LIMITS` بین `0.55` و `2.1` است و `clampZoom` از خروج از این بازه جلوگیری می‌کند. `resetCamera` به نمای جلو و زوم یک برمی‌گردد.

## عضلات و هایلایت

`mapMuscles(config)` عضله‌های اصلی، کمکی، و آن‌هایی را که ناحیه‌شان روی مدل نیست (`unmapped`) برمی‌گرداند. هایلایت بر پایهٔ ناحیه‌های آناتومیک (`src/motion/muscles.ts`) است، نه عضله‌ی دقیق؛ بنابراین ناحیه‌ها روی مدل ساده‌ی CC0 نقاشی می‌شوند.

## بارگذاری مدل

`createAssetLoader` وضعیت `idle` → `loading` → `ready` یا `error` را دنبال می‌کند، نتیجه را کش می‌کند، و `retry` و `dispose` دارد. `classifyFailure` خطا را به یکی از کدهای `ENGINE_ERROR_CODES` تبدیل می‌کند:

| کد | معنی | تلاش دوباره |
| --- | --- | --- |
| `invalid-exercise-id` | شناسهٔ تمرین وجود ندارد یا نامعتبر است | خیر |
| `invalid-config` | پیکربندی با اسکیما نمی‌خواند | خیر |
| `missing-model` | فایل مدل پیدا نشد (۴۰۴) | خیر |
| `missing-animation` | حرکت در کتابخانه نیست | خیر |
| `unsupported-rig` | rig پشتیبانی نمی‌شود | خیر |
| `download-failed` | دانلود قطع شد یا خطای شبکه | بله |
| `corrupt-asset` | فایل GLB معتبر نیست | خیر |
| `render-init-failed` | نمایش سه‌بعدی راه‌اندازی نشد | بله |
| `unsupported-device` | WebGL در دسترس نیست | خیر |

## نمایش در اپ

- `src/engine-demo/` یک صفحه‌ی مستقل است: `/engine-demo.html` (در توسعه) و `dist/engine-demo.html` (در بیلد). ورودی آن در `vite.config.ts` ثبت شده و در بیلد آفلاین تک‌فایل نیست.
- کانواس رندر با `lazy` بارگذاری می‌شود؛ شروع اپ سنگین‌تر نمی‌شود.
- `ExerciseViewer.tsx` و صفحات موجود بدون تغییر کار می‌کنند؛ `ExerciseModelCanvas` پراپ‌های جدید (`scrub`، `loop`، `onFinish`، `onPosition`، `cameraResetToken`) را دارد که اختیاری هستند.

## اجرا و تست

```bash
npm ci
npx tsc -b                 # بررسی تایپ
npm run test:engine        # تست‌های موتور
npm run verify:engine      # اعتبارسنجی همهٔ تمرین‌ها و تولید docs/engine/STATUS.md
npm test                   # همهٔ تست‌ها
npm run build              # بیلد با PWA
npm run build:offline      # بیلد آفلاین تک‌فایل
npm run verify:offline
npm run verify:model       # هش SHA-256 مدل
```

تست‌های موتور در `tests/engine/` قرار دارند: اسکیما، ثبت، پخش، دوربین، عضلات، بارگذاری، قابلیت دستگاه، و خود دمو (با کانواس ساختگی، چون WebGL در jsdom نیست).

## مستندات مرتبط

- [PIPELINE.md](./PIPELINE.md): افزودن حرکت یا مدل و مراحل تأیید بصری.
- [LICENSES.md](./LICENSES.md): مجوز هر دارایی.
- [LIMITATIONS.md](./LIMITATIONS.md): آنچه هنوز کامل نیست.
- [STATUS.md](./STATUS.md): گزارش تولیدشده از `npm run verify:engine`.
