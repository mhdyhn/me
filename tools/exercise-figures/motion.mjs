/**
 * Builds the animated guide for every exercise that has a start and a main pose.
 *
 *   node tools/exercise-figures/motion.mjs [outDir]
 *
 * Default outDir: public/exercise-motion. Files: <exercise-id>.json
 *
 * The poses are interpolated (joint angles, not drawn points) so the figure keeps its
 * proportions while it moves. The result is a list of SVG elements with the animated
 * attributes, which the app renders inline and drives with its own clock.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROUND, GROUND_CANVAS, H, PALETTE, S, W, renderPose } from './render.mjs';
import { POSES } from './poses.mjs';

/** Frames of the half movement: start, three steps, main. */
export const FRAMES = 5;
/** Seconds for the whole cycle, down and up again. */
export const DURATION = 2.6;

const lerp = (from, to, ratio) => from + (to - from) * ratio;
/** Angles are circular: 350° to 10° goes through 0°, not backwards through 180°. */
const lerpAngle = (from, to, ratio) => {
  let delta = to - from;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return from + delta * ratio;
};

const lerpPoint = (from, to, ratio) => [lerp(from[0], to[0], ratio), lerp(from[1], to[1], ratio)];

/** A pose halfway between the start and the working position. */
export function interpolatePose(start, main, ratio) {
  const pose = { ...start };
  if (start.view === 'end' || main.view === 'end') {
    pose.cx = lerp(start.cx ?? 240, main.cx ?? 240, ratio);
    pose.arms = {
      L: [lerpAngle(start.arms.L[0], main.arms.L[0], ratio), lerpAngle(start.arms.L[1], main.arms.L[1], ratio)],
      R: [lerpAngle(start.arms.R[0], main.arms.R[0], ratio), lerpAngle(start.arms.R[1], main.arms.R[1], ratio)],
    };
    return pose;
  }
  pose.root = lerpPoint(start.root, main.root, ratio);
  for (const key of ['torso', 'thigh', 'shin', 'foot', 'uarm', 'farm']) {
    pose[key] = lerpAngle(start[key] ?? 0, main[key] ?? 0, ratio);
  }
  if (start.far || main.far) {
    const from = start.far ?? {};
    const to = main.far ?? {};
    pose.far = {};
    for (const key of ['uarm', 'farm', 'thigh', 'shin', 'foot']) {
      if (from[key] === undefined && to[key] === undefined) continue;
      pose.far[key] = lerpAngle(from[key] ?? to[key] ?? 0, to[key] ?? from[key] ?? 0, ratio);
    }
  }
  return pose;
}

const ELEMENT_PATTERN = /<(polyline|circle|rect|line)\b([^>]*?)\/>/g;
const ATTRIBUTE_PATTERN = /([a-zA-Z-]+)="([^"]*)"/g;

/** The drawn elements of one rendered pose, in drawing order. */
export function parseElements(svg) {
  const groupStart = svg.indexOf('<g ');
  const body = svg.slice(svg.indexOf('>', groupStart) + 1, svg.lastIndexOf('</g>'));
  return [...body.matchAll(ELEMENT_PATTERN)].map((match) => ({
    tag: match[1],
    attrs: Object.fromEntries([...match[2].matchAll(ATTRIBUTE_PATTERN)].map((attribute) => [attribute[1], attribute[2]])),
  }));
}

/** Which attributes of each element type move with the pose. */
const ANIMATED_ATTRIBUTES = {
  polyline: ['points'],
  circle: ['cx', 'cy'],
  line: ['x1', 'y1', 'x2', 'y2'],
  rect: ['x', 'y'],
};

/**
 * The animated description of one exercise, or `null` when the two poses draw a
 * different set of elements and therefore cannot be merged.
 */
export function buildMotion(states) {
  const frames = [];
  const rendered = [];
  for (let index = 0; index < FRAMES; index += 1) {
    const ratio = index / (FRAMES - 1);
    const svg = renderPose(interpolatePose(states.start, states.main, ratio), {});
    rendered.push(svg);
    frames.push(parseElements(svg));
  }
  const base = frames[0];
  if (!base.length) return null;
  for (const frame of frames) {
    if (frame.length !== base.length) return null;
    if (frame.some((element, index) => element.tag !== base[index].tag)) return null;
  }
  const elements = base.map((element, index) => {
    const animate = {};
    for (const key of ANIMATED_ATTRIBUTES[element.tag] ?? []) {
      const values = frames.map((frame) => frame[index].attrs[key] ?? '');
      if (values.some((value) => value === '')) continue;
      if (new Set(values).size === 1) continue;
      animate[key] = values;
    }
    return { tag: element.tag, attrs: element.attrs, animate };
  });
  // The animated guide uses the same transform as the static image of the same movement.
  const transform = /<g transform="([^"]+)"/.exec(rendered[0])?.[1] ?? `translate(${(W / 2 - 240 * S).toFixed(1)} ${(GROUND_CANVAS - GROUND * S).toFixed(1)}) scale(${S})`;
  return {
    duration: DURATION,
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    background: PALETTE.bg,
    ground: { y: GROUND_CANVAS, color: PALETTE.ground },
    transform,
    elements,
  };
}

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outDir = resolve(process.argv[2] ?? join(root, 'public', 'exercise-motion'));
  mkdirSync(outDir, { recursive: true });
  let count = 0;
  for (const [id, states] of Object.entries(POSES)) {
    const motion = buildMotion(states);
    if (!motion) {
      console.warn(`skipped ${id}: the two poses do not draw the same elements`);
      continue;
    }
    writeFileSync(join(outDir, `${id}.json`), `${JSON.stringify(motion)}\n`);
    count += 1;
  }
  console.log(`wrote ${count} motion files to ${outDir}`);
}
