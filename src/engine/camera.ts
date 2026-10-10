/**
 * Camera presets and limits. Angles follow the scene's convention: the figure faces +z
 * for the front view, and the side view looks from +x. The math is pure so the viewer and
 * the tests use the same numbers.
 */
import type { CameraView } from './schema';

export type Vec3 = [number, number, number];

/** Azimuth in degrees around the vertical axis, for each fixed preset. */
export const PRESET_AZIMUTH: Record<Exclude<CameraView, 'free'>, number> = {
  front: 0,
  side: 90,
  rear: 180,
};

export const ZOOM_LIMITS = { minFactor: 0.55, maxFactor: 2.1 } as const;

export interface CameraState {
  view: CameraView;
  /** Distance from the target as a multiple of the framing distance. */
  zoom: number;
}

export const DEFAULT_CAMERA: CameraState = { view: 'front', zoom: 1 };

/** Camera position for a preset, around `target`, at `distance` metres. */
export function presetPosition(view: Exclude<CameraView, 'free'>, target: Vec3, distance: number): Vec3 {
  const angle = (PRESET_AZIMUTH[view] * Math.PI) / 180;
  return [target[0] + Math.sin(angle) * distance, target[1] + 0.15, target[2] + Math.cos(angle) * distance];
}

/** Keeps zoom inside the limits so pinching cannot put the camera inside the body. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_LIMITS.maxFactor, Math.max(ZOOM_LIMITS.minFactor, zoom));
}

/** Pinch and wheel gestures: a scale above 1 zooms in, so the distance shrinks. */
export function zoomBy(state: CameraState, scale: number): CameraState {
  if (!Number.isFinite(scale) || scale <= 0) return state;
  return { ...state, zoom: clampZoom(state.zoom / scale) };
}

export function selectView(state: CameraState, view: CameraView): CameraState {
  return { ...state, view };
}

/** Back to the default framing. Free camera is left the way the reader set it. */
export function resetCamera(): CameraState {
  return { ...DEFAULT_CAMERA };
}

/** Framing distance for a figure of `radius` metres, given a vertical field of view in degrees. */
export function framingDistance(radius: number, fovDegrees: number): number {
  const fov = (fovDegrees * Math.PI) / 180;
  const distance = (radius / Math.tan(fov / 2)) * 1.15;
  return Math.min(9, Math.max(2.4, distance));
}
