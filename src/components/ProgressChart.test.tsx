import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressChart, sampleChartIndices } from './ProgressChart';

describe('large chart histories', () => {
  it('keeps the first, last and bucket extrema in chronological order', () => {
    const points = Array.from({ length: 600 }, (_, index) => ({ label: String(index), value: index === 273 ? 900 : index === 472 ? -300 : 1 }));
    const indices = sampleChartIndices(points);
    expect(indices.length).toBeLessThanOrEqual(200);
    expect(indices[0]).toBe(0);
    expect(indices.at(-1)).toBe(599);
    expect(indices).toContain(273);
    expect(indices).toContain(472);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    render(<ProgressChart points={points} label="آزمون" unit="" />);
    expect(screen.getByText(/خلاصه‌ای از ۶۰۰ ثبت/)).toBeInTheDocument();
    expect(document.querySelectorAll('circle').length).toBeLessThanOrEqual(200);
  });
});
