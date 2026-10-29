import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { isUncertainWrite } from './writeOutcome';

describe('unknown write outcomes', () => {
  it.each([0, 200, 204, 408, 409, 500, 502, 503])('requires a fresh read after status %i', (status) => {
    expect(isUncertainWrite(new ApiError(status, 'response'))).toBe(true);
  });
  it.each([400, 401, 403, 413, 429])('keeps an explicit client error %i distinct', (status) => {
    expect(isUncertainWrite(new ApiError(status, 'response'))).toBe(false);
  });
  it('treats unexpected exceptions as uncertain', () => expect(isUncertainWrite(new Error('invalid response'))).toBe(true));
});
