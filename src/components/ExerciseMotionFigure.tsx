import { useEffect, useMemo, useRef, useState } from 'react';

export interface MotionElement {
  tag: string;
  attrs: Record<string, string>;
  animate: Record<string, string[]>;
}

export interface MotionData {
  duration: number;
  viewBox: string;
  width: number;
  height: number;
  background: string;
  ground: { y: number; color: string };
  transform: string;
  elements: MotionElement[];
}

/** SVG attributes are hyphenated in the generated files; React expects camel case. */
const REACT_ATTRIBUTE: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'fill-opacity': 'fillOpacity',
  'stroke-opacity': 'strokeOpacity',
};

function reactProps(attrs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [REACT_ATTRIBUTE[key] ?? key, value]));
}

/** The animation goes down to the working position and back to the start. */
function keyFrames(values: string[]): string[] {
  return [...values, ...values.slice(0, -1).reverse()];
}

export function exerciseMotionUrl(exerciseId: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}exercise-motion/${exerciseId}.json`;
}

/** The system setting that asks for less motion; the animation then waits for the student. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listener = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.('change', listener);
    return () => query.removeEventListener?.('change', listener);
  }, []);
  return reduced;
}

/** Loads the animated guide of a movement; `null` when the movement has none. */
export function useExerciseMotion(exerciseId: string): MotionData | null {
  const [motion, setMotion] = useState<MotionData | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setMotion(null);
    fetch(exerciseMotionUrl(exerciseId), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() as Promise<MotionData> : Promise.reject(new Error('no motion'))))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.elements) || !data.elements.length) return;
        setMotion(data);
      })
      .catch(() => { if (!cancelled) setMotion(null); });
    return () => { cancelled = true; controller.abort(); };
  }, [exerciseId]);
  return motion;
}

/**
 * The animated figure of a movement. The generated guide is played on the app's own clock,
 * so the student can pause it and slow it down.
 */
export function ExerciseMotionFigure({
  data,
  name,
  playing = true,
  speed = 1,
  className,
}: {
  data: MotionData;
  name: string;
  playing?: boolean;
  speed?: number;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    // Not every browser (or test environment) can drive the SVG clock.
    if (typeof svg.getCurrentTime !== 'function' || typeof svg.setCurrentTime !== 'function') return;
    svg.pauseAnimations?.();
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const delta = (now - last) / 1000;
      last = now;
      const duration = data.duration || 2.6;
      const time = (svg.getCurrentTime() + delta * speed) % duration;
      svg.setCurrentTime(time);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data, playing, speed]);

  const frames = useMemo(() => data.elements.map((element) => {
    const animations = Object.entries(element.animate).map(([attribute, values]) => {
      const sequence = keyFrames(values);
      const keyTimes = sequence.map((_value, index) => `${(index / (sequence.length - 1)).toFixed(4)}`).join(';');
      const keySplines = new Array(Math.max(0, sequence.length - 1)).fill('0.42 0 0.58 1').join(';');
      return (
        <animate
          key={attribute}
          attributeName={attribute}
          values={sequence.join(';')}
          keyTimes={keyTimes}
          keySplines={keySplines}
          calcMode="spline"
          dur={`${data.duration}s`}
          repeatCount="indefinite"
        />
      );
    });
    return { element, animations };
  }), [data]);

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={data.viewBox}
      width={data.width}
      height={data.height}
      role="img"
      aria-label={`${name}: اجرای انیمیشنی حرکت`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={data.width} height={data.height} fill={data.background} />
      <line x1={0} y1={data.ground.y} x2={data.width} y2={data.ground.y} stroke={data.ground.color} strokeWidth={2} />
      <g transform={data.transform}>
        {frames.map(({ element, animations }, index) => {
          const props = reactProps(element.attrs);
          if (element.tag === 'polyline') return <polyline key={index} {...props}>{animations}</polyline>;
          if (element.tag === 'circle') return <circle key={index} {...props}>{animations}</circle>;
          if (element.tag === 'line') return <line key={index} {...props}>{animations}</line>;
          if (element.tag === 'rect') return <rect key={index} {...props}>{animations}</rect>;
          return null;
        })}
      </g>
    </svg>
  );
}
