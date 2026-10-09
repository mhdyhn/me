import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ModelErrorBoundary } from './ModelErrorBoundary';

function Bomb(): never {
  throw new Error('boom');
}

describe('ModelErrorBoundary', () => {
  it('keeps the reader on the page and reports what the model request returned', async () => {
    const onRetry = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ModelErrorBoundary asset="/models/human.glb" onRetry={onRetry}>
        <Bomb />
      </ModelErrorBoundary>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری مدل سه‌بعدی ناموفق بود');
    // The reason travels with the fallback instead of living only in a console nobody opens.
    expect(await screen.findByText(/reason: Error: boom/)).toBeInTheDocument();
    expect(screen.getByText(/asset: \/models\/human\.glb/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری دوبارهٔ مدل' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('can drop the caches a bad model response may be stuck in before retrying', async () => {
    const onRetry = vi.fn();
    const deleted: string[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(globalThis, 'caches', {
      configurable: true,
      value: {
        keys: async () => ['meety-exercise-models'],
        delete: async (key: string) => {
          deleted.push(key);
          return true;
        },
      },
    });

    render(
      <ModelErrorBoundary asset="/models/human.glb" onRetry={onRetry}>
        <Bomb />
      </ModelErrorBoundary>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'پاک‌سازی کش و بارگذاری دوباره' }));
    await waitFor(() => expect(deleted).toEqual(['meety-exercise-models']));
    expect(onRetry).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it('renders the canvas when nothing throws', () => {
    render(
      <ModelErrorBoundary asset="/models/human.glb">
        <p>canvas</p>
      </ModelErrorBoundary>,
    );

    expect(screen.getByText('canvas')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
