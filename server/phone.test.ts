// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { requireMobile } from './phone.ts';

describe('mobile number normalization without verification', () => {
  it.each(['09123456789', '۰۹۱۲۳۴۵۶۷۸۹', '٠٩١٢٣٤٥٦٧٨٩', '+98 912 345 6789', '0098-912-345-6789', '989123456789'])('normalizes %s', (value) => {
    expect(requireMobile(value)).toBe('09123456789');
  });
  it.each([undefined, '', '123456', '08123456789', '091234567890', '+98 x9123456789'])('rejects %s', (value) => {
    expect(() => requireMobile(value)).toThrow('شماره موبایل');
  });
});
