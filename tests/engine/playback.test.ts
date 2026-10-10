import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_SPEEDS,
  UnsupportedSpeedError,
  advance,
  createPlayback,
  pause,
  phaseAt,
  phaseSpans,
  play,
  restart,
  seek,
  setLoop,
  setSpeed,
  type EnginePhase,
} from '../../src/engine';

const phases: EnginePhase[] = [
  { id: 'start', label: { fa: 'شروع', en: 'Start' }, at: 0 },
  { id: 'eccentric', label: { fa: 'پایین', en: 'Lower' }, at: 0.25 },
  { id: 'main', label: { fa: 'اصلی', en: 'Main' }, at: 0.5 },
];

describe('playback speeds', () => {
  it('offers exactly the six speeds from the brief', () => {
    expect([...PLAYBACK_SPEEDS]).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it('rejects a speed that is not offered', () => {
    expect(() => setSpeed(createPlayback(), 3)).toThrow(UnsupportedSpeedError);
    expect(() => createPlayback({ speed: 0.25 as never })).toThrow(UnsupportedSpeedError);
  });

  it('changes how far the movement advances per real second', () => {
    const slow = advance(play(setSpeed(createPlayback(), 0.5)), 1, 4);
    const fast = advance(play(setSpeed(createPlayback(), 2)), 1, 4);
    expect(slow.position).toBeCloseTo(0.125);
    expect(fast.position).toBeCloseTo(0.5);
  });

  it('keeps every offered speed exact at 1x and at 2x', () => {
    for (const speed of PLAYBACK_SPEEDS) {
      const next = advance(play(setSpeed(createPlayback(), speed)), 2, 8);
      expect(next.position).toBeCloseTo((2 * speed) / 8);
    }
  });
});

describe('play, pause and restart', () => {
  it('does not move while paused', () => {
    const state = createPlayback();
    expect(advance(state, 5, 4)).toEqual(state);
  });

  it('pause keeps the position; restart returns to the top and plays', () => {
    let state = play(createPlayback());
    state = advance(state, 1, 4);
    const paused = pause(state);
    expect(paused.playing).toBe(false);
    expect(paused.position).toBe(state.position);
    const again = restart(paused);
    expect(again.position).toBe(0);
    expect(again.playing).toBe(true);
  });
});

describe('looping', () => {
  it('wraps around when loop is on', () => {
    const next = advance(play(seek(createPlayback(), 0.9)), 1, 1);
    expect(next.playing).toBe(true);
    expect(next.position).toBeCloseTo(0.9);
  });

  it('stops at the end when loop is off, and play starts again from the top', () => {
    let state = play(setLoop(createPlayback(), false));
    state = advance(state, 10, 4);
    expect(state.position).toBe(1);
    expect(state.playing).toBe(false);
    expect(state.finished).toBe(true);
    const replay = play(state);
    expect(replay.position).toBe(0);
    expect(replay.playing).toBe(true);
  });
});

describe('timeline scrubbing', () => {
  it('moves to the chosen position', () => {
    expect(seek(createPlayback(), 0.42).position).toBe(0.42);
  });

  it('clamps out-of-range values', () => {
    expect(seek(createPlayback(), -3).position).toBe(0);
    expect(seek(createPlayback(), 7).position).toBe(1);
  });

  it('ignores values that are not numbers', () => {
    const state = seek(createPlayback(), 0.3);
    expect(seek(state, Number.NaN)).toBe(state);
  });
});

describe('phase lookup', () => {
  it('reports the last phase that has started', () => {
    expect(phaseAt(phases, 0).id).toBe('start');
    expect(phaseAt(phases, 0.3).id).toBe('eccentric');
    expect(phaseAt(phases, 0.5).id).toBe('main');
    expect(phaseAt(phases, 0.99).id).toBe('main');
  });

  it('covers the whole loop with contiguous spans', () => {
    const spans = phaseSpans(phases);
    expect(spans[0]!.start).toBe(0);
    expect(spans.at(-1)!.end).toBe(1);
    for (let index = 1; index < spans.length; index += 1) {
      expect(spans[index]!.start).toBe(spans[index - 1]!.end);
    }
  });

  it('refuses an exercise with no phases', () => {
    expect(() => phaseAt([], 0)).toThrow();
  });
});

describe('clock step used by the renderer', () => {
  it('matches advance for loops and for a single run', async () => {
    const { stepPosition } = await import('../../src/engine');
    expect(stepPosition(0.9, 1, 1, 1, true).position).toBeCloseTo(0.9);
    const end = stepPosition(0.9, 1, 1, 1, false);
    expect(end).toEqual({ position: 1, finished: true });
    expect(stepPosition(0.2, 0, 1, 4, true)).toEqual({ position: 0.2, finished: false });
  });
});
