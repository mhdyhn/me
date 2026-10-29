import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessionDraft, removeSessionDraft, writeSessionDraft } from './sessionDraft';

const isArray = (value: unknown): value is number[] => Array.isArray(value) && value.every((item) => typeof item === 'number');
beforeEach(() => { sessionStorage.clear(); });

describe('tab-local draft storage', () => {
  it('round-trips incomplete numeric input without turning NaN into a valid zero', () => {
    expect(writeSessionDraft('draft', [1], [NaN, Infinity, -Infinity, 2])).toBe(true);
    const result = readSessionDraft('draft', isArray);
    expect(result.kind).toBe('recovery');
    if (result.kind === 'recovery') expect(result.record.draft).toEqual([NaN, Infinity, -Infinity, 2]);
  });

  it('keeps malformed or incompatible data intact rather than silently clearing it', () => {
    sessionStorage.setItem('draft', '{broken');
    expect(readSessionDraft('draft', isArray).kind).toBe('invalid');
    expect(sessionStorage.getItem('draft')).toBe('{broken');
    sessionStorage.setItem('draft', JSON.stringify({ version: 99, base: [], draft: [] }));
    expect(readSessionDraft('draft', isArray).kind).toBe('invalid');
    expect(sessionStorage.getItem('draft')).toContain('99');
  });

  it('reports denied storage without pretending a copy was kept or removed', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readSessionDraft('draft', isArray).kind).toBe('unavailable');
    get.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(writeSessionDraft('draft', [], [1])).toBe(false);
    set.mockRestore();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(removeSessionDraft('draft')).toBe(false);
    remove.mockRestore();
  });
});
