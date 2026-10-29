import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PersianDateInput, isoToPersian, persianToIso } from './PersianDateInput';

describe('Persian date input', () => {
  it('converts Nowruz and leap-day keys without changing the stored date', () => {
    expect(isoToPersian('2024-03-20')).toEqual({ jy: 1403, jm: 1, jd: 1 });
    expect(persianToIso({ jy: 1403, jm: 12, jd: 30 })).toBe('2025-03-20');
    for (const date of ['2023-03-20', '2024-03-20', '2025-03-20', '2026-10-30', '2000-02-29']) {
      expect(persianToIso(isoToPersian(date))).toBe(date);
    }
  });
  it('rejects impossible Gregorian and Persian dates rather than silently normalizing them', () => {
    expect(() => isoToPersian('2025-02-29')).toThrow();
    expect(() => isoToPersian('not-a-date')).toThrow();
    expect(() => persianToIso({ jy: 1404, jm: 12, jd: 30 })).toThrow();
    expect(() => persianToIso({ jy: 1403, jm: 13, jd: 1 })).toThrow();
  });
  it('stages the chosen date and confirms an ISO key only once', () => {
    const onChange = vi.fn();
    render(<PersianDateInput value="2024-03-20" onChange={onChange} label="روز" />);
    expect(screen.getByRole('button', { name: 'روز' })).toHaveTextContent('۱۴۰۳/۰۱/۰۱');
    fireEvent.click(screen.getByRole('button', { name: 'روز' }));
    fireEvent.change(screen.getByLabelText('ماه شمسی'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('روز شمسی'), { target: { value: '30' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب تاریخ' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2025-03-20');
  });
  it('clamps a leap day when changing year and prevents selecting a future date', () => {
    const onChange = vi.fn();
    render(<PersianDateInput value="2025-03-20" max="2025-03-20" onChange={onChange} label="روز" />);
    fireEvent.click(screen.getByRole('button', { name: 'روز' }));
    fireEvent.change(screen.getByLabelText('سال شمسی'), { target: { value: '1404' } });
    expect(screen.getByLabelText('روز شمسی')).toHaveValue('29');
    expect(screen.getByRole('button', { name: 'انتخاب تاریخ' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
