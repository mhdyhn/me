/**
 * Standalone demo of the exercise engine. It exercises the public API only:
 * openExercise, the playback and camera state, the asset loader and the muscle mapping.
 * The renderer is the same canvas the app uses, with the controls the engine needs.
 */
import { Component, lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { motions } from '../motion/library';
import {
  CAMERA_VIEWS,
  PLAYBACK_SPEEDS,
  createAssetLoader,
  createPlayback,
  deviceProblem,
  describeError,
  mapMuscles,
  openExercise,
  pause,
  phaseAt,
  play,
  probeModel,
  resetCamera,
  restart,
  seek,
  setLoop,
  setSpeed,
  engineRegistry,
  type AssetState,
  type CameraView,
  type EngineExerciseConfig,
  type LocalizedText,
  type PlaybackState,
} from '../engine';

const ExerciseModelCanvas = lazy(() => import('../components/ExerciseModelCanvas'));

type Language = 'fa' | 'en';

const COPY = {
  fa: {
    title: 'نمایشگر تمرین سه‌بعدی',
    library: 'کتابخانهٔ تمرین',
    equipment: 'تجهیزات',
    primary: 'عضلهٔ اصلی',
    secondary: 'عضلهٔ کمکی',
    unpainted: 'این عضلات روی مدل رنگ‌آمیزی نشده‌اند',
    muscleNote: 'این نقشه آموزشی است؛ اندازه‌گیری فعالیت عضلانی نیست.',
    play: 'پخش',
    pause: 'توقف',
    restart: 'از اول',
    loop: 'تکرار',
    speed: 'سرعت',
    views: 'زاویهٔ دید',
    front: 'روبه‌رو',
    side: 'پهلو',
    rear: 'پشت',
    free: 'آزاد',
    reset: 'بازنشانی دوربین',
    timeline: 'زمان حرکت',
    phase: 'مرحلهٔ فعلی',
    steps: 'مراحل حرکت',
    loading: 'در حال بارگذاری مدل…',
    retry: 'تلاش دوباره',
    unknown: 'تمرینی با این شناسه پیدا نشد.',
    setup: 'آمادگی',
    start: 'شروع',
    finish: 'پایان',
    breathing: 'تنفس',
    tempo: 'ریتم',
    mistakes: 'اشتباهات رایج',
    safety: 'نکات ایمنی',
    status: 'وضعیت بازبینی',
    unverifiedNote: 'این حرکت هنوز بازبینی بصری نشده است.',
    lang: 'English',
    viewerFailed: 'نمایش سه‌بعدی در این دستگاه اجرا نشد.',
    diffHelp: 'برای باز کردن یک تمرین، ?exercise=شناسه را به آدرس اضافه کن.',
  },
  en: {
    title: 'Exercise 3D viewer',
    library: 'Exercise library',
    equipment: 'Equipment',
    primary: 'Primary muscles',
    secondary: 'Secondary muscles',
    unpainted: 'These muscles are not painted on the model',
    muscleNote: 'This map is educational; it does not measure muscle activity.',
    play: 'Play',
    pause: 'Pause',
    restart: 'Restart',
    loop: 'Loop',
    speed: 'Speed',
    views: 'Camera view',
    front: 'Front',
    side: 'Side',
    rear: 'Rear',
    free: 'Free',
    reset: 'Reset camera',
    timeline: 'Movement timeline',
    phase: 'Current phase',
    steps: 'Movement steps',
    loading: 'Loading the model…',
    retry: 'Try again',
    unknown: 'No exercise with that id was found.',
    setup: 'Setup',
    start: 'Start',
    finish: 'Finish',
    breathing: 'Breathing',
    tempo: 'Tempo',
    mistakes: 'Common mistakes',
    safety: 'Safety notes',
    status: 'Review status',
    unverifiedNote: 'This movement has not been visually reviewed yet.',
    lang: 'فارسی',
    viewerFailed: 'The 3D viewer could not run on this device.',
    diffHelp: 'Add ?exercise=<id> to the address to open a specific exercise.',
  },
} as const;

const SPEED_LABEL: Record<string, string> = { '0.5': '0.5×', '0.75': '0.75×', '1': '1×', '1.25': '1.25×', '1.5': '1.5×', '2': '2×' };
const VIEW_TO_CANVAS: Record<CameraView, 'front' | 'side' | 'back' | 'free'> = { front: 'front', side: 'side', rear: 'back', free: 'free' };

const text = (value: LocalizedText, lang: Language) => value[lang];

/** Keeps a failure in the 3D view from blanking the page: the reader gets a message instead. */
class ViewerBoundary extends Component<{ children: ReactNode; fallback: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('[engine-demo] viewer failed', error);
  }
  render() {
    return this.state.failed ? <p className="engine-notice engine-notice--error">{this.props.fallback}</p> : this.props.children;
  }
}

// The canvas re-renders only when its own inputs change, not on every clock report.
const Viewer = memo(ExerciseModelCanvas);

export default function EngineDemo() {
  const params = new URLSearchParams(window.location.search);
  const [lang, setLang] = useState<Language>(params.get('lang') === 'en' ? 'en' : 'fa');
  const copy = COPY[lang];
  const [requestedId, setRequestedId] = useState(params.get('exercise') ?? '');
  const registry = useMemo(() => engineRegistry(), []);
  const listed = useMemo(() => registry.list(), [registry]);
  const opened = useMemo(() => openExercise(requestedId || listed[0]?.id), [requestedId, listed]);
  const config: EngineExerciseConfig | null = opened.ok ? opened.config : null;

  const [playback, setPlayback] = useState<PlaybackState>(() => createPlayback());
  const [view, setView] = useState<CameraView>('front');
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [restartToken, setRestartToken] = useState(0);
  const [scrub, setScrub] = useState<{ position: number; token: number } | null>(null);
  const scrubToken = useRef(0);

  // Each exercise starts from its own defaults.
  useEffect(() => {
    if (!config) return;
    setPlayback(createPlayback({ speed: config.playback.defaultSpeed, loop: config.playback.loop }));
    setView(config.camera.defaultView);
    setScrub(null);
  }, [config]);

  const loader = useMemo(() => createAssetLoader<ArrayBuffer>({ load: (url, signal) => probeModel(url, signal) }), []);
  const [asset, setAsset] = useState<AssetState<ArrayBuffer>>(() => loader.state());
  const modelUrl = config?.model.asset ?? null;

  useEffect(() => {
    if (!modelUrl) return undefined;
    let live = true;
    loader.request(modelUrl).then((state) => live && setAsset(state));
    return () => {
      live = false;
    };
  }, [loader, modelUrl]);

  useEffect(() => () => loader.dispose(), [loader]);

  const retry = useCallback(() => {
    loader.retry().then(setAsset);
  }, [loader]);

  const onPosition = useCallback((position: number) => {
    setPlayback((state) => (state.playing ? { ...state, position } : state));
  }, []);
  const onFinish = useCallback(() => {
    setPlayback((state) => ({ ...state, playing: false, finished: true, position: 1 }));
  }, []);

  if (!config) {
    return (
      <Shell lang={lang} setLang={setLang} copy={copy}>
        <section className="engine-card engine-notice engine-notice--error">
          <strong>{describeError(opened.ok ? 'invalid-exercise-id' : opened.error.code).message[lang]}</strong>
          <p>{copy.unknown}</p>
          <p className="engine-hint">{copy.diffHelp}</p>
        </section>
        <Library lang={lang} items={listed} onPick={setRequestedId} copy={copy} />
      </Shell>
    );
  }

  const motion = motions[config.motion.id] ?? null;
  const mapping = mapMuscles(config);
  const noWebGL = deviceProblem(window);
  const phase = phaseAt(config.phases, playback.position);
  const primaryNames = mapping.primary.map((item) => item.label.en);
  const secondaryNames = mapping.secondary.map((item) => item.label.en);
  const ready = asset.status === 'ready' && motion !== null && noWebGL === null;

  const togglePlay = () => setPlayback((state) => (state.playing ? pause(state) : play(state)));
  const doRestart = () => {
    setPlayback((state) => restart(state));
    setRestartToken((value) => value + 1);
  };
  const doScrub = (position: number) => {
    scrubToken.current += 1;
    setPlayback((state) => pause(seek(state, position)));
    setScrub({ position, token: scrubToken.current });
  };

  return (
    <Shell lang={lang} setLang={setLang} copy={copy}>
      <div className="engine-layout">
        <section className="engine-card engine-viewer" aria-label={text(config.name, lang)}>
          <h2>{text(config.name, lang)}</h2>
          <div className="engine-stage" role="img" aria-label={text(config.name, lang)}>
            {asset.status === 'loading' || asset.status === 'idle' ? <p className="engine-notice">{copy.loading}</p> : null}
            {asset.status === 'error' && asset.error ? (
              <div className="engine-notice engine-notice--error">
                <p>{asset.error.message[lang]}</p>
                {asset.error.retryable ? (
                  <button type="button" className="engine-button" onClick={retry}>{copy.retry}</button>
                ) : null}
              </div>
            ) : null}
            {noWebGL ? <p className="engine-notice engine-notice--error">{noWebGL.message[lang]}</p> : null}
            {ready ? (
              <ViewerBoundary fallback={copy.viewerFailed}>
                <Suspense fallback={<p className="engine-notice">{copy.loading}</p>}>
                  <Viewer
                    asset={config.model.asset}
                    motion={motion}
                    view={VIEW_TO_CANVAS[view]}
                    speed={playback.speed}
                    playing={playback.playing}
                    restartToken={restartToken}
                    scrub={scrub}
                    loop={playback.loop}
                    onFinish={onFinish}
                    onPosition={onPosition}
                    cameraResetToken={cameraResetToken}
                    anatomy
                    figureStyle="statue"
                    primaryMuscles={primaryNames}
                    secondaryMuscles={secondaryNames}
                  />
                </Suspense>
              </ViewerBoundary>
            ) : null}
          </div>

          <div className="engine-controls" role="group" aria-label={copy.views}>
            {CAMERA_VIEWS.map((item) => (
              <button
                key={item}
                type="button"
                className="engine-button"
                aria-pressed={view === item}
                onClick={() => setView(item)}
              >
                {copy[item]}
              </button>
            ))}
            <button type="button" className="engine-button" onClick={() => { setView(resetCamera().view); setCameraResetToken((value) => value + 1); }}>
              {copy.reset}
            </button>
          </div>

          <div className="engine-controls" role="group" aria-label={copy.speed}>
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className="engine-button"
                aria-pressed={playback.speed === speed}
                onClick={() => setPlayback((state) => setSpeed(state, speed))}
              >
                {SPEED_LABEL[String(speed)]}
              </button>
            ))}
          </div>

          <div className="engine-controls" role="group" aria-label={copy.play}>
            <button type="button" className="engine-button engine-button--primary" disabled={!ready} onClick={togglePlay}>
              {playback.playing ? copy.pause : copy.play}
            </button>
            <button type="button" className="engine-button" disabled={!ready} onClick={doRestart}>{copy.restart}</button>
            <label className="engine-toggle">
              <input type="checkbox" checked={playback.loop} onChange={(event) => setPlayback((state) => setLoop(state, event.target.checked))} />
              {copy.loop}
            </label>
          </div>

          <label className="engine-timeline">
            <span>{copy.timeline}</span>
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(playback.position * 1000)}
              disabled={!ready}
              aria-valuetext={`${Math.round(playback.position * 100)}%`}
              onChange={(event) => doScrub(Number(event.target.value) / 1000)}
            />
          </label>

          <div className="engine-phase" aria-live="polite">
            <span className="engine-eyebrow">{copy.phase}</span>
            <strong>{text(phase.label, lang)}</strong>
            {phase.instruction ? <p>{text(phase.instruction, lang)}</p> : null}
          </div>
          {motion === null ? <p className="engine-notice">{copy.loading}</p> : null}
        </section>

        <aside className="engine-side">
          <section className="engine-card">
            <h3>{copy.steps}</h3>
            <ol className="engine-steps">
              {config.phases.map((item) => (
                <li key={item.id} className={item.id === phase.id ? 'is-current' : undefined}>
                  <strong>{text(item.label, lang)}</strong>
                  {item.instruction ? <span>{text(item.instruction, lang)}</span> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="engine-card">
            <h3>{copy.primary}</h3>
            <ul className="engine-tags">
              {mapping.primary.map((item) => <li key={item.region}>{text(item.label, lang)}</li>)}
            </ul>
            {mapping.secondary.length > 0 ? (
              <>
                <h3>{copy.secondary}</h3>
                <ul className="engine-tags">
                  {mapping.secondary.map((item) => <li key={item.region}>{text(item.label, lang)}</li>)}
                </ul>
              </>
            ) : null}
            {mapping.unmapped.length > 0 ? (
              <p className="engine-hint">{copy.unpainted}: {mapping.unmapped.map((item) => text(item, lang)).join('، ')}</p>
            ) : null}
            <p className="engine-hint">{copy.muscleNote}</p>
          </section>

          <section className="engine-card">
            <h3>{copy.equipment}</h3>
            <ul className="engine-tags">
              {config.equipment.map((item) => <li key={item.en}>{text(item, lang)}</li>)}
            </ul>
          </section>

          <section className="engine-card">
            <h3>{text({ fa: 'آماده‌سازی و اجرا', en: 'Setup and execution' }, lang)}</h3>
            <dl className="engine-facts">
              <dt>{copy.setup}</dt><dd>{text(config.instructions.setup, lang)}</dd>
              <dt>{copy.start}</dt><dd>{text(config.instructions.start, lang)}</dd>
              {config.instructions.execution.map((step, index) => (
                <div key={index}><dt>{index + 1}</dt><dd>{text(step, lang)}</dd></div>
              ))}
              <dt>{copy.finish}</dt><dd>{text(config.instructions.finish, lang)}</dd>
              <dt>{copy.breathing}</dt><dd>{text(config.instructions.breathing, lang)}</dd>
              <dt>{copy.tempo}</dt><dd>{text(config.instructions.tempo, lang)}</dd>
            </dl>
          </section>

          <section className="engine-card">
            <h3>{copy.mistakes}</h3>
            <ul>{config.commonMistakes.map((item) => <li key={item.en}>{text(item, lang)}</li>)}</ul>
            <h3>{copy.safety}</h3>
            <ul>{config.safetyNotes.map((item) => <li key={item.en}>{text(item, lang)}</li>)}</ul>
          </section>

          <section className="engine-card">
            <h3>{copy.status}</h3>
            <p>
              <span className="engine-badge">{config.validation.status}</span>{' '}
              {config.validation.status === 'unverified' ? copy.unverifiedNote : config.validation.notes}
            </p>
          </section>

          <Library lang={lang} items={listed} onPick={setRequestedId} copy={copy} current={config.id} />
        </aside>
      </div>
    </Shell>
  );
}

function Shell({
  lang,
  setLang,
  copy,
  children,
}: {
  lang: Language;
  setLang: (value: Language) => void;
  copy: (typeof COPY)[Language];
  children: ReactNode;
}) {
  return (
    <main className="engine-page" dir={lang === 'fa' ? 'rtl' : 'ltr'} lang={lang === 'fa' ? 'fa-IR' : 'en'}>
      <header className="engine-header">
        <h1>{copy.title}</h1>
        <button type="button" className="engine-button" onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}>{copy.lang}</button>
      </header>
      {children}
    </main>
  );
}

function Library({
  lang,
  items,
  onPick,
  copy,
  current,
}: {
  lang: Language;
  items: EngineExerciseConfig[];
  onPick: (id: string) => void;
  copy: (typeof COPY)[Language];
  current?: string;
}) {
  return (
    <section className="engine-card">
      <h3>{copy.library}</h3>
      <ul className="engine-library">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="engine-link"
              aria-current={item.id === current ? 'true' : undefined}
              onClick={() => onPick(item.id)}
            >
              {text(item.name, lang)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
