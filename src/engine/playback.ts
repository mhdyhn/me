/**
 * Playback state for one exercise. Pure functions: the viewer owns the clock and asks
 * this module where the movement is. Every transition returns a new state object.
 */
import { PLAYBACK_SPEEDS, type EnginePhase, type PlaybackSpeed } from './schema';

export interface PlaybackState {
  playing: boolean;
  speed: PlaybackSpeed;
  loop: boolean;
  /** Position in the loop, in [0, 1]. Position 1 is the end of the movement. */
  position: number;
  /** True once a non-looping movement has reached its end. */
  finished: boolean;
}

export interface PlaybackOptions {
  speed?: PlaybackSpeed;
  loop?: boolean;
}

export class UnsupportedSpeedError extends Error {
  constructor(readonly speed: number) {
    super(`Playback speed ${speed} is not offered. Use one of ${PLAYBACK_SPEEDS.join(', ')}.`);
    this.name = 'UnsupportedSpeedError';
  }
}

export const isPlaybackSpeed = (value: number): value is PlaybackSpeed =>
  (PLAYBACK_SPEEDS as readonly number[]).includes(value);

export function createPlayback(options: PlaybackOptions = {}): PlaybackState {
  const speed = options.speed ?? 1;
  if (!isPlaybackSpeed(speed)) throw new UnsupportedSpeedError(speed);
  return { playing: false, speed, loop: options.loop ?? true, position: 0, finished: false };
}

export function play(state: PlaybackState): PlaybackState {
  // Pressing play at the end of a non-looping movement starts it again from the top.
  if (state.finished) return { ...state, playing: true, position: 0, finished: false };
  return { ...state, playing: true };
}

export function pause(state: PlaybackState): PlaybackState {
  return { ...state, playing: false };
}

export function restart(state: PlaybackState): PlaybackState {
  return { ...state, position: 0, finished: false, playing: true };
}

export function setSpeed(state: PlaybackState, speed: number): PlaybackState {
  if (!isPlaybackSpeed(speed)) throw new UnsupportedSpeedError(speed);
  return { ...state, speed };
}

export function setLoop(state: PlaybackState, loop: boolean): PlaybackState {
  return { ...state, loop, finished: false };
}

/** Jumps to a position chosen on the timeline. Values outside [0, 1] are clamped. */
export function seek(state: PlaybackState, position: number): PlaybackState {
  if (!Number.isFinite(position)) return state;
  const clamped = Math.min(1, Math.max(0, position));
  return { ...state, position: clamped, finished: false };
}

/**
 * Moves the clock forward by real seconds. Speed scales the time the movement takes:
 * at 2x the same loop finishes in half the seconds.
 */
export function advance(state: PlaybackState, seconds: number, durationSeconds: number): PlaybackState {
  if (!state.playing) return state;
  const step = stepPosition(state.position, seconds, state.speed, durationSeconds, state.loop);
  if (step.finished) return { ...state, position: 1, playing: false, finished: true };
  return { ...state, position: step.position };
}

/**
 * The clock arithmetic on its own, for a renderer that keeps its own frame loop. Same
 * rules as `advance`: speed scales the time, loops wrap, and a non-looping movement
 * stops at 1 and reports `finished`.
 */
export function stepPosition(
  position: number,
  seconds: number,
  speed: number,
  durationSeconds: number,
  loop: boolean,
): { position: number; finished: boolean } {
  if (seconds <= 0 || durationSeconds <= 0) return { position, finished: false };
  const next = position + (seconds * speed) / durationSeconds;
  if (loop) return { position: next % 1, finished: false };
  if (next >= 1) return { position: 1, finished: true };
  return { position: next, finished: false };
}

/** The phase the movement is in at a loop position: the last phase that has started. */
export function phaseAt(phases: readonly EnginePhase[], position: number): EnginePhase {
  const first = phases[0];
  if (!first) throw new Error('an exercise must have at least one phase');
  let current = first;
  for (const phase of phases) {
    if (phase.at <= position) current = phase;
  }
  return current;
}

/** Share of the timeline a phase covers, for drawing the phase bar. */
export function phaseSpans(phases: readonly EnginePhase[]): Array<{ phase: EnginePhase; start: number; end: number }> {
  return phases.map((phase, index) => ({
    phase,
    start: phase.at,
    end: index + 1 < phases.length ? phases[index + 1]!.at : 1,
  }));
}
