import { describe, expect, it } from 'vitest';
import { faNumber, formatDate, formatDuration, kg } from './format';

describe('Persian number and date formatting', () => {
  it('formats numbers and weights with Persian digits and separators', () => {
    expect(faNumber(1234.5)).toBe('۱٬۲۳۴٫۵');
    expect(kg(77)).toBe('۷۷ کیلوگرم');
  });

  it('formats dates with the Persian calendar', () => {
    const date = new Date('2026-10-01T12:00:00.000Z');
    expect(formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })).toBe('۹ مهر ۱۴۰۵');
  });

  it('formats workout durations in Persian', () => {
    expect(formatDuration(3660)).toBe('۱ ساعت و ۱ دقیقه');
  });
});
