import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSessionDraft } from './useSessionDraft';

const isText = (value: unknown): value is string => typeof value === 'string';
afterEach(() => vi.restoreAllMocks());

it('does not overwrite a possibly existing copy if the initial storage read was blocked', async () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => { throw new Error('blocked'); });
  const set = vi.spyOn(Storage.prototype, 'setItem');
  const hook = renderHook(({ draft }) => useSessionDraft('blocked-draft', 'base', draft, draft !== 'base', true, isText), { initialProps: { draft: 'base' } });
  get.mockRestore();
  hook.rerender({ draft: 'new work' });
  await waitFor(() => expect(hook.result.current.storage).toBe('failed'));
  expect(set).not.toHaveBeenCalled();
});
