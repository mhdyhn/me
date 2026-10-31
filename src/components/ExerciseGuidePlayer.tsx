import { useEffect, useState } from 'react';
import { Columns2, Pause, Play } from 'lucide-react';
import { exerciseFigureSrc } from '../data/exerciseFigures';
import { ExerciseMotionFigure, useExerciseMotion, usePrefersReducedMotion } from './ExerciseMotionFigure';

/**
 * The visual guide of an exercise: an animated figure when the movement has one, and the
 * two-frame comparison otherwise. Both show the same start and working positions.
 */
export function ExerciseGuidePlayer({ name, visualId, hasFigure }: { name: string; visualId: string; hasFigure: boolean }) {
  const motion = useExerciseMotion(visualId);
  const reducedMotion = usePrefersReducedMotion();
  const [activeFrame, setActiveFrame] = useState<'start' | 'main'>('start');
  const [isPlaying, setIsPlaying] = useState(!reducedMotion);
  const [speed, setSpeed] = useState<1 | 0.5>(1);
  const [viewMode, setViewMode] = useState<'loop' | 'compare'>('loop');
  const [loopProgress, setLoopProgress] = useState(0);

  // The two-frame cross fade stays for the movements without an animated figure.
  useEffect(() => {
    if (!isPlaying || viewMode !== 'loop' || motion || !hasFigure) {
      if (!motion) setLoopProgress(0);
      return;
    }
    const intervalMs = speed === 1 ? 1200 : 2000;
    const stepMs = 50;
    let elapsed = 0;
    const interval = window.setInterval(() => {
      elapsed += stepMs;
      const pct = Math.min(100, Math.round((elapsed / intervalMs) * 100));
      setLoopProgress(pct);
      if (elapsed >= intervalMs) {
        elapsed = 0;
        setActiveFrame((prev) => (prev === 'start' ? 'main' : 'start'));
      }
    }, stepMs);
    return () => window.clearInterval(interval);
  }, [isPlaying, viewMode, speed, motion, hasFigure]);

  if (!hasFigure) return null;

  return (
    <section className="lyfta-player" aria-label="آموزش تصویری حرکت">
      {viewMode === 'loop' ? (
        <div className="lyfta-player__screen">
          <div className="lyfta-player__badge">
            <span className={`lyfta-player__badge-dot ${motion ? 'lyfta-player__badge-dot--main' : activeFrame === 'start' ? 'lyfta-player__badge-dot--start' : 'lyfta-player__badge-dot--main'}`} />
            <span>{motion ? 'اجرای کامل حرکت (تکرار پیوسته)' : activeFrame === 'start' ? 'وضعیت ۱: آماده‌سازی و شروع' : 'وضعیت ۲: اوج انقباض و اجرا'}</span>
          </div>
          {motion ? (
            <ExerciseMotionFigure data={motion} name={name} playing={isPlaying} speed={speed} className="lyfta-player__motion" />
          ) : (
            <>
              <img
                src={exerciseFigureSrc(visualId, 'start')}
                alt={`${name}: وضعیت شروع`}
                className="lyfta-player__img lyfta-player__img--start"
                style={{ opacity: activeFrame === 'start' ? 1 - loopProgress / 100 : loopProgress / 100 }}
                loading="eager"
                decoding="async"
              />
              <img
                src={exerciseFigureSrc(visualId, 'main')}
                alt={`${name}: وضعیت انقباض`}
                className="lyfta-player__img lyfta-player__img--main"
                style={{ opacity: activeFrame === 'start' ? loopProgress / 100 : 1 - loopProgress / 100 }}
                loading="eager"
                decoding="async"
              />
            </>
          )}
          <div className="lyfta-player__progress">
            {motion ? (
              <div
                className="lyfta-player__progress-bar lyfta-player__progress-bar--loop"
                style={{ animationDuration: `${(motion.duration || 2.6) / speed}s`, animationPlayState: isPlaying ? 'running' : 'paused' }}
              />
            ) : (
              <div className="lyfta-player__progress-bar" style={{ width: `${loopProgress}%` }} />
            )}
          </div>
        </div>
      ) : (
        <div style={{ padding: '14px 14px 0' }}>
          <figure className="exercise-figures" style={{ margin: 0 }}>
            <div>
              <img src={exerciseFigureSrc(visualId, 'start')} alt={`${name}: وضعیت شروع`} loading="lazy" decoding="async" />
              <figcaption>شروع</figcaption>
            </div>
            <div>
              <img src={exerciseFigureSrc(visualId, 'main')} alt={`${name}: وضعیت اجرا`} loading="lazy" decoding="async" />
              <figcaption>اجرا</figcaption>
            </div>
          </figure>
        </div>
      )}

      <div className="lyfta-player__controls">
        <div className="lyfta-player__buttons">
          <button
            type="button"
            className="button button--ghost"
            style={{ padding: '6px 12px', fontSize: 13, height: 'auto' }}
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'توقف انیمیشن' : 'پخش لوپ متحرک'}
          >
            {isPlaying ? <><Pause size={15} /> توقف</> : <><Play size={15} /> پخش لوپ</>}
          </button>
          <button
            type="button"
            className="button button--ghost"
            style={{ padding: '6px 12px', fontSize: 13, height: 'auto' }}
            onClick={() => {
              setViewMode(viewMode === 'loop' ? 'compare' : 'loop');
              setIsPlaying(false);
            }}
          >
            <Columns2 size={15} /> {viewMode === 'loop' ? 'مقایسه دو فاز' : 'نمایش لوپ'}
          </button>
        </div>

        <div className="lyfta-player__buttons">
          <span className="account-muted" style={{ fontSize: 12 }}>سرعت:</span>
          <button
            type="button"
            className={`lyfta-player__speed-btn${speed === 1 ? ' is-active' : ''}`}
            onClick={() => setSpeed(1)}
          >
            ۱x
          </button>
          <button
            type="button"
            className={`lyfta-player__speed-btn${speed === 0.5 ? ' is-active' : ''}`}
            onClick={() => setSpeed(0.5)}
          >
            ۰٫۵x
          </button>
        </div>
      </div>
    </section>
  );
}
