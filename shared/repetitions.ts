/** Normalize the Persian/Arabic digits and dashes commonly used in training plans. */
export function normalizeReps(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632))
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

/** Repetitions must be positive and an optional upper bound must not be smaller. */
export function isValidReps(value: string): boolean {
  const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(normalizeReps(value));
  if (!match) return false;
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;
  return min >= 1 && max >= min && max <= 99;
}
