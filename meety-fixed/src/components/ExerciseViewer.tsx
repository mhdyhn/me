import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Box, Eye, ListChecks, Pause, Play, RotateCcw, Scan } from 'lucide-react';
import { ModelErrorBoundary } from './ModelErrorBoundary';
import { motionById } from '../motion/library';
import { unknownMuscles, type FigureStyle } from '../motion/muscles';
import type { MotionStandard } from '../motion/types';
import { faNumber } from '../lib/format';

/** Split out so the first paint does not wait for three.js; rebuilt per load attempt because
 * a rejected dynamic import stays rejected for the life of the page, which would make the
 * fallback's retry button useless. */
const canvasLoader = () => import('./ExerciseModelCanvas');
type ViewAngle = 'front' | 'side' | 'back';
const views: { id: ViewAngle; label: string }[] = [
  { id: 'front', label: 'روبرو' },
  { id: 'side', label: 'پهلو' },
  { id: 'back', label: 'پشت' },
];

/** How the figure is presented: the neutral statue, or the textures of the file. */
const FIGURES: { id: FigureStyle; label: string }[] = [
  { id: 'statue', label: 'مجسمه' },
  { id: 'textured', label: 'بافت اصلی' },
];

interface ExerciseViewerProps {
  modelAsset?: string | null;
  /** Movement loop for this exercise, keyed by the workout library. */
  motionId?: string | null;
  /** Written step the model should hold, with a token that changes on each click. */
  seek?: { phase: number; token: number } | null;
  exerciseName: string;
  /** Muscles of the exercise, painted on the model in the anatomy view. */
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

export function ExerciseViewer({
  modelAsset,
  motionId,
  seek,
  exerciseName,
  primaryMuscles = [],
  secondaryMuscles = [],
}: ExerciseViewerProps) {
  const motion = useMemo(() => (motionId ? motionById(motionId) ?? null : null), [motionId]);
  const asset = modelAsset || null;
  const [view, setView] = useState<ViewAngle>('front');
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [anatomy, setAnatomy] = useState(false);
  const [figureStyle, setFigureStyle] = useState<FigureStyle>('statue');
  const [restartToken, setRestartToken] = useState(0);
  const [phase, setPhase] = useState({ label: motion?.keys[0]?.label ?? '', phase: 0 });

  useEffect(() => {
    setPlaying(true);
    setPhase({ label: motion?.keys[0]?.label ?? '', phase: 0 });
  }, [motion, asset]);

  /**
   * The 3D runtime and the model together are the heaviest thing the app ships,
   * so they are fetched while the reader is still on the written form instead of
   * when the canvas mounts. Both requests hit the service-worker cache.
   */
  useEffect(() => {
    if (!asset) return undefined;
    const warm = () => {
      void import('./ExerciseModelCanvas');
      void fetch(asset, { cache: 'force-cache' }).catch(() => undefined);
    };
    const idle = window.requestIdleCallback?.(warm) ?? window.setTimeout(warm, 600);
    return () => {
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle as number);
      else window.clearTimeout(idle as number);
    };
  }, [asset]);

  // A failed load is often a poisoned cache entry for the asset URL, so retrying asks for
  // the same file under a new key instead of reloading the whole page.
  const [modelAttempt, setModelAttempt] = useState(0);
  const canvasAsset = !modelAttempt || !asset ? asset : `${asset}${asset.includes('?') ? '&' : '?'}retry=${modelAttempt}`;
  const ModelCanvas = useMemo(() => lazy(canvasLoader), [modelAttempt]);

  const hasMotion = Boolean(motion && asset);
  const unpaintable = useMemo(
    () => unknownMuscles([...primaryMuscles, ...secondaryMuscles]),
    [primaryMuscles, secondaryMuscles],
  );

  // Jumping to a written step shows one position, so the loop stops there.
  useEffect(() => {
    if (seek) setPlaying(false);
  }, [seek?.token]);

  return (
    <section className="viewer-card" aria-label={`نمایش سه‌بعدی ${exerciseName}`}>
      <div className="viewer-heading">
        <div>
          <span className="eyebrow">{hasMotion ? 'نمایش حرکت' : 'مدل مرجع'}</span>
          <h3>{hasMotion ? 'نمای سه‌بعدی حرکت' : 'مدل سه‌بعدی بدن'}</h3>
        </div>
        <span
          className={`viewer-status${hasMotion ? ' viewer-status--ready' : asset ? ' viewer-status--static' : ''}`}
          role="status"
          aria-live="polite"
        >
          <span />
          {anatomy && asset
            ? 'نمای عضلات فعال است'
            : hasMotion
              ? 'پویانمایی حرکت فعال است'
              : asset
                ? 'مدل ثابت · بدون پویانمایی'
                : 'مدل هنوز افزوده نشده'}
        </span>
      </div>

      <div className="viewer-stage">
        {canvasAsset ? (
          <ModelErrorBoundary
            key={modelAttempt}
            asset={asset ?? undefined}
            onRetry={() => setModelAttempt((attempt) => attempt + 1)}
          >
            <Suspense fallback={<div className="viewer-loading"><span className="loader-dot" /> در حال بارگذاری مدل سه‌بعدی…</div>}>
              <ModelCanvas
                asset={canvasAsset}
                motion={hasMotion ? motion : null}
                view={view}
                speed={speed}
                playing={playing && hasMotion}
                restartToken={restartToken}
                seek={seek}
                onKeyLabel={(label, keyPhase) => setPhase({ label, phase: keyPhase })}
                anatomy={anatomy}
                figureStyle={figureStyle}
                primaryMuscles={primaryMuscles}
                secondaryMuscles={secondaryMuscles}
              />
            </Suspense>
          </ModelErrorBoundary>
        ) : (
          <div className="viewer-placeholder">
            <div className="viewer-grid" aria-hidden="true" />
            <div className="viewer-placeholder__mark"><Box size={34} strokeWidth={1.1} /></div>
            <span className="viewer-placeholder__code" dir="ltr">GLB / glTF · بارگذاری تنبل</span>
            <strong>هنوز مدل سه‌بعدی اضافه نشده است</strong>
            <p>این راهنما برای افزودن مدل و پویانمایی دارای مجوز و بهینه‌شده برای موبایل آماده است. در حال حاضر از تصویر آماده یا مدل شبیه‌سازی‌شده استفاده نمی‌شود.</p>
            <span className="viewer-placeholder__foot"><Eye size={14} /> راهنمای چیدمان و مراحل حرکت در ادامه آمده است.</span>
          </div>
        )}
      </div>

      <div className="viewer-controls">
        <div className="viewer-control-group" role="group" aria-label="زاویهٔ دید">
          {views.map((item) => (
            <button key={item.id} type="button" disabled={!asset} aria-pressed={view === item.id} onClick={() => setView(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="viewer-control-group viewer-control-group--speed" role="group" aria-label="سرعت پویانمایی">
          {[0.25, 0.5, 1, 1.5].map((item) => (
            <button key={item} type="button" disabled={!hasMotion} aria-pressed={speed === item} onClick={() => setSpeed(item)}>
              {faNumber(item)}×
            </button>
          ))}
        </div>
        <div className="viewer-control-group viewer-control-group--figure" role="group" aria-label="ظاهر بدن مدل">
          {FIGURES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={!asset}
              aria-pressed={figureStyle === item.id}
              onClick={() => setFigureStyle(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="viewer-control-group viewer-control-group--anatomy" role="group" aria-label="نمای بدن">
          <button
            type="button"
            disabled={!asset}
            aria-pressed={anatomy}
            onClick={() => setAnatomy((value) => !value)}
          >
            <Scan size={14} />
            نمای عضلات
          </button>
        </div>
        <div className="viewer-control-group viewer-control-group--transport" role="group" aria-label="کنترل پویانمایی">
          <button type="button" disabled={!hasMotion} aria-label={playing && hasMotion ? 'توقف پویانمایی' : 'پخش پویانمایی'} onClick={() => setPlaying((value) => !value)}>
            {playing && hasMotion ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" disabled={!hasMotion} aria-label="شروع دوبارهٔ پویانمایی" onClick={() => setRestartToken((value) => value + 1)}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>

      {anatomy && asset ? (
        <div className="viewer-anatomy">
          <span className="eyebrow">عضلات درگیر در این حرکت</span>
          <ul>
            {primaryMuscles.length > 0 ? (
              <li><i className="muscle-key muscle-key--prime" />عضلهٔ اصلی: {primaryMuscles.join(' · ')}</li>
            ) : null}
            {secondaryMuscles.length > 0 ? (
              <li><i className="muscle-key muscle-key--helper" />عضلهٔ کمکی: {secondaryMuscles.join(' · ')}</li>
            ) : null}
          </ul>
          <p>
            این نقشه بر پایهٔ عضلاتی است که این حرکت در برنامه می‌آموزد، نه اندازه‌گیری فعالیت عضلانی؛
            الگو را برای یادگیری مسیر حرکت ببین، نه به‌عنوان عدد و درصد.
            {unpaintable.length > 0 ? ` (${unpaintable.join(' · ')} در این مدل رنگ‌آمیزی نشده است.)` : ''}
          </p>
        </div>
      ) : null}

      {hasMotion && motion ? (
        <>
          {/* The loop's own label changes constantly, so it stays out of the live region. */}
          <div className="viewer-phase">
            <span className="eyebrow">مرحلهٔ فعلی</span>
            <strong>{phase.label || motion.keys[0]?.label}</strong>
            <p>{motion.summary}</p>
          </div>
          <div className="viewer-standards">
            <span className="eyebrow"><ListChecks size={14} /> استانداردهای فرم همین حرکت</span>
            <ul>
              {motion.standards.map((standard: MotionStandard) => (
                <li key={standard.label}><strong>{standard.label}</strong><span>{standard.detail}</span></li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <p className="viewer-note">
          {asset
            ? 'این مدل ثابت فقط برای مشاهدهٔ بدن از چند زاویه است؛ برای این حرکت هنوز پویانمایی ثبت نشده است.'
            : 'با افزودن مدل، نمایش سه‌بعدی حرکت‌ها فعال می‌شود.'}
        </p>
      )}
    </section>
  );
}
