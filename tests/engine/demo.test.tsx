import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EngineDemo from '../../src/engine-demo/EngineDemo';

// A minimal binary glTF header: enough for the model probe to accept the file.
const glbBytes = () => new TextEncoder().encode('glTF\u0002\u0000\u0000\u0000');

function openWith(query: string) {
  window.history.replaceState({}, '', `/engine-demo.html${query}`);
}

describe('engine demo', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // jsdom has no WebGL; the canvas itself is mocked, so the page only needs the capability flag.
    (window as unknown as Record<string, unknown>).WebGLRenderingContext = function WebGLRenderingContext() {};
    globalThis.fetch = vi.fn(async () => new Response(glbBytes(), { status: 200 })) as unknown as typeof fetch;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).WebGLRenderingContext;
    globalThis.fetch = originalFetch;
    window.history.replaceState({}, '', '/');
  });

  it('opens the exercise named in the address and shows its name and muscles', async () => {
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Barbell Bench Press', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByText('Primary muscles')).toBeInTheDocument();
  });

  it('accepts the underscore form of an id', async () => {
    openWith('?exercise=barbell_bench_press&lang=en');
    render(<EngineDemo />);
    expect(await screen.findByRole('heading', { name: 'Barbell Bench Press', level: 2 })).toBeInTheDocument();
  });

  it('shows a clear message for an unknown id, with the library to pick from', async () => {
    openWith('?exercise=not-a-movement&lang=en');
    render(<EngineDemo />);
    expect(await screen.findByText('No exercise with that id was found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Barbell Bench Press' })).toBeInTheDocument();
  });

  it('switches speed, and the pressed speed is the one chosen', async () => {
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    await screen.findByRole('heading', { level: 2 });
    const speeds = ['0.5×', '0.75×', '1×', '1.25×', '1.5×', '2×'];
    for (const label of speeds) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole('button', { name: '1.25×' }));
    expect(screen.getByRole('button', { name: '1.25×' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts paused and toggles play and pause', async () => {
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    await screen.findByRole('heading', { level: 2 });
    const play = await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('camera presets and reset are wired to the viewer state', async () => {
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    await screen.findByRole('heading', { level: 2 });
    await userEvent.click(screen.getByRole('button', { name: 'Rear' }));
    expect(screen.getByRole('button', { name: 'Rear' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Free' }));
    expect(screen.getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Reset camera' }));
    expect(screen.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('timeline scrubbing moves the reported position', async () => {
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    await screen.findByRole('heading', { level: 2 });
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '250' } });
    expect(slider).toHaveValue('250');
    expect(slider).toHaveAttribute('aria-valuetext', '25%');
  });

  it('language switch changes the interface to English', async () => {
    openWith('?exercise=barbell-bench-press');
    render(<EngineDemo />);
    expect(await screen.findByRole('heading', { name: 'نمایشگر تمرین سه‌بعدی', level: 1 })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Exercise 3D viewer', level: 1 })).toBeInTheDocument();
  });

  it('a device without WebGL gets a clear message, not an empty viewer', async () => {
    delete (window as unknown as Record<string, unknown>).WebGLRenderingContext;
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    expect(await screen.findByText('This device does not support 3D viewing.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('a missing model is reported as missing, with no retry offered', async () => {
    globalThis.fetch = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    expect(await screen.findByText('The 3D model file could not be found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('a network failure is reported with a retry that loads the model again', async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls += 1;
      if (calls <= 3) throw new TypeError('offline');
      return new Response(glbBytes(), { status: 200 });
    }) as unknown as typeof fetch;
    openWith('?exercise=barbell-bench-press&lang=en');
    render(<EngineDemo />);
    const retry = await screen.findByRole('button', { name: 'Try again' });
    await userEvent.click(retry);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
  });
});
