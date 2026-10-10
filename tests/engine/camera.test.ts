import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMERA,
  ZOOM_LIMITS,
  clampZoom,
  framingDistance,
  presetPosition,
  resetCamera,
  selectView,
  zoomBy,
} from '../../src/engine';

const target: [number, number, number] = [0, 0.9, 0];
const close = (a: number[], b: number[]) => a.forEach((value, index) => expect(value).toBeCloseTo(b[index]!, 6));

describe('camera presets', () => {
  it('front looks from +z, side from +x, rear from -z', () => {
    close(presetPosition('front', target, 3), [0, 1.05, 3]);
    close(presetPosition('side', target, 3), [3, 1.05, 0]);
    close(presetPosition('rear', target, 3), [0, 1.05, -3]);
  });

  it('keeps the distance from the target equal across presets', () => {
    for (const view of ['front', 'side', 'rear'] as const) {
      const [x, , z] = presetPosition(view, target, 2.5);
      expect(Math.hypot(x, z)).toBeCloseTo(2.5);
    }
  });
});

describe('zoom', () => {
  it('clamps to the limits so the camera cannot enter the body', () => {
    expect(clampZoom(100)).toBe(ZOOM_LIMITS.maxFactor);
    expect(clampZoom(0.01)).toBe(ZOOM_LIMITS.minFactor);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('pinching outwards zooms in (zoom factor falls), pinching inwards zooms out', () => {
    const inward = zoomBy(DEFAULT_CAMERA, 2);
    expect(inward.zoom).toBeLessThan(DEFAULT_CAMERA.zoom);
    const outward = zoomBy(DEFAULT_CAMERA, 0.5);
    expect(outward.zoom).toBeGreaterThan(DEFAULT_CAMERA.zoom);
  });

  it('ignores gestures with no usable scale', () => {
    expect(zoomBy(DEFAULT_CAMERA, 0)).toBe(DEFAULT_CAMERA);
    expect(zoomBy(DEFAULT_CAMERA, Number.NaN)).toBe(DEFAULT_CAMERA);
  });
});

describe('view state', () => {
  it('switches views and resets to the default framing', () => {
    const side = selectView(DEFAULT_CAMERA, 'side');
    expect(side.view).toBe('side');
    expect(resetCamera()).toEqual(DEFAULT_CAMERA);
  });

  it('framing distance grows with the figure and stays in bounds', () => {
    expect(framingDistance(0.1, 36)).toBeGreaterThanOrEqual(2.4);
    expect(framingDistance(100, 36)).toBeLessThanOrEqual(9);
    expect(framingDistance(1.2, 36)).toBeGreaterThan(framingDistance(0.8, 36));
  });
});
