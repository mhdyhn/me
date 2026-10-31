import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExerciseGuidePlayer } from './ExerciseGuidePlayer';

const motion = {
  duration: 2.6,
  viewBox: '0 0 480 320',
  width: 480,
  height: 320,
  background: '#171d1b',
  ground: { y: 300, color: '#2a332f' },
  transform: 'translate(81.6 104.6) scale(0.66)',
  elements: [
    { tag: 'polyline', attrs: { points: '240,124 250,211', fill: 'none', stroke: '#0c100e', 'stroke-width': '23' }, animate: { points: ['240,124 250,211', '230,136 260,218', '240,124 250,211'] } },
    { tag: 'circle', attrs: { cx: '240', cy: '40', r: '15', fill: '#dfe6e0' }, animate: { cx: ['240', '230', '240'], cy: ['40', '52', '40'] } },
  ],
};

function stubFetch(response: { ok: boolean; body?: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response.body ?? {}), {
    status: response.ok ? 200 : 404,
    headers: { 'Content-Type': 'application/json' },
  })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the exercise guide player', () => {
  it('animates the movement when the exercise has an animated figure', async () => {
    stubFetch({ ok: true, body: motion });
    const { container } = render(<ExerciseGuidePlayer name="پرس سینه" visualId="barbell-bench-press" hasFigure />);
    await waitFor(() => expect(container.querySelector('svg.lyfta-player__motion')).toBeTruthy());
    const animations = container.querySelectorAll('animate');
    expect(animations.length).toBeGreaterThan(0);
    const polyline = container.querySelector('polyline animate');
    expect(polyline?.getAttribute('values')?.split(';').length).toBe(5);
    expect(screen.getByText(/اجرای کامل حرکت/)).toBeTruthy();
  });

  it('falls back to the two static phases when there is no animated figure', async () => {
    stubFetch({ ok: false });
    const { container } = render(<ExerciseGuidePlayer name="پرس سینه" visualId="barbell-bench-press" hasFigure />);
    await waitFor(() => expect(container.querySelectorAll('img').length).toBe(2));
    expect(container.querySelector('svg.lyfta-player__motion')).toBeNull();
    expect(screen.getByText(/وضعیت ۱/)).toBeTruthy();
  });

  it('shows nothing for a movement without any figure', () => {
    stubFetch({ ok: false });
    const { container } = render(<ExerciseGuidePlayer name="حرکت" visualId="unknown" hasFigure={false} />);
    expect(container.innerHTML).toBe('');
  });
});
