// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildMotion, interpolatePose, parseElements } from './motion.mjs';
import { POSES } from './poses.mjs';
import { renderPose } from './render.mjs';

/** The movements of the catalogue the student can browse. */
const catalogueIds = () => {
  const source = readFileSync(resolve('src/data/exercises.ts'), 'utf8');
  return [...source.matchAll(/id:\s*'([a-z0-9-]+)'/g)].map((match) => match[1]);
};

const segmentLengths = (points) => {
  const pairs = points.split(' ').map((pair) => pair.split(',').map(Number));
  return pairs.slice(0, -1).map((point, index) => {
    const next = pairs[index + 1];
    return Math.hypot(next[0] - point[0], next[1] - point[1]);
  });
};

describe('the animated exercise guide', () => {
  it('builds a motion file for every pose', () => {
    for (const [id, states] of Object.entries(POSES)) {
      const motion = buildMotion(states);
      expect(motion, id).not.toBeNull();
      expect(motion.elements.length, id).toBeGreaterThan(4);
      expect(motion.duration, id).toBeGreaterThan(0);
    }
  });

  it('covers every catalogue movement with a pose and an animated guide', () => {
    for (const id of catalogueIds()) {
      expect(Object.hasOwn(POSES, id), `pose for ${id}`).toBe(true);
      expect(existsSync(resolve('public/exercise-motion', `${id}.json`)), `motion for ${id}`).toBe(true);
    }
  });

  it('keeps the limb lengths while the figure moves', () => {
    // The limbs are drawn from joint angles, so interpolating the pose must not stretch them.
    for (const [id, states] of Object.entries(POSES)) {
      const lengths = [];
      for (let index = 0; index < 5; index += 1) {
        const ratio = index / 4;
        const elements = parseElements(renderPose(interpolatePose(states.start, states.main, ratio), {}));
        const polyline = elements.find((element) => element.tag === 'polyline');
        if (!polyline) continue;
        lengths.push(segmentLengths(polyline.attrs.points));
      }
      if (lengths.length < 2) continue;
      const reference = lengths[0];
      lengths.forEach((frame, index) => {
        frame.forEach((length, part) => {
          expect(Math.abs(length - reference[part]), `${id} frame ${index} part ${part}`).toBeLessThan(1.5);
        });
      });
    }
  });

  it('starts at the start pose and ends at the working position', () => {
    for (const [id, states] of Object.entries(POSES)) {
      const motion = buildMotion(states);
      const start = parseElements(renderPose(states.start, {}));
      const main = parseElements(renderPose(states.main, {}));
      const animated = motion.elements.filter((element) => Object.keys(element.animate).length);
      expect(animated.length, id).toBeGreaterThan(0);
      motion.elements.forEach((element, index) => {
        for (const [attribute, values] of Object.entries(element.animate)) {
          expect(values[0], `${id} ${attribute}`).toBe(start[index].attrs[attribute]);
          expect(values[values.length - 1], `${id} ${attribute}`).toBe(main[index].attrs[attribute]);
          expect(new Set(values).size, `${id} ${attribute}`).toBeGreaterThan(1);
        }
      });
    }
  });
});
