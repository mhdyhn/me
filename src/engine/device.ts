/**
 * Device capability checks. The engine needs WebGL to draw the figure; without it the
 * reader gets an `unsupported-device` message instead of an empty box.
 */
import { describeError, type EngineErrorInfo } from './errors';

/** True when the window exposes a WebGL rendering context type. */
export function hasWebGL(scope: object | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!scope) return false;
  const host = scope as Record<string, unknown>;
  return typeof host.WebGL2RenderingContext === 'function' || typeof host.WebGLRenderingContext === 'function';
}

/** The error to show when the device cannot draw the 3D view, or null when it can. */
export function deviceProblem(scope?: object): EngineErrorInfo | null {
  return hasWebGL(scope) ? null : describeError('unsupported-device');
}
