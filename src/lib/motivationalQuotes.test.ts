import { describe, it, expect, beforeEach } from 'vitest';
import { getFreshMotivationalQuote, MOTIVATIONAL_QUOTES } from './motivationalQuotes';

describe('Motivational Quotes Engine', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('contains at least 25 unique, rich motivational quotes', () => {
    expect(MOTIVATIONAL_QUOTES.length).toBeGreaterThanOrEqual(25);
    const ids = new Set(MOTIVATIONAL_QUOTES.map((q) => q.id));
    expect(ids.size).toBe(MOTIVATIONAL_QUOTES.length);
  });

  it('returns a valid quote with title and subtitle', () => {
    const quote = getFreshMotivationalQuote();
    expect(quote).toHaveProperty('title');
    expect(quote).toHaveProperty('subtitle');
    expect(quote.title.length).toBeGreaterThan(3);
    expect(quote.subtitle.length).toBeGreaterThan(5);
  });

  it('does not repeat the same quote on consecutive calls', () => {
    const quote1 = getFreshMotivationalQuote();
    const quote2 = getFreshMotivationalQuote();
    const quote3 = getFreshMotivationalQuote();
    const quote4 = getFreshMotivationalQuote();

    const ids = [quote1.id, quote2.id, quote3.id, quote4.id];
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(4);
  });

  it('cycles gracefully even when called more times than recent history size', () => {
    for (let i = 0; i < 35; i++) {
      const q = getFreshMotivationalQuote();
      expect(q).toBeDefined();
      expect(q.title).toBeTruthy();
    }
  });

  it('can filter by category', () => {
    const q = getFreshMotivationalQuote('recovery');
    expect(q.category).toBe('recovery');
  });
});
