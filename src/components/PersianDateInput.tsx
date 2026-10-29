import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali, type JalaaliDate } from 'jalaali-js';
import { faDigits } from '../lib/format';

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

/** Date keys remain Gregorian YYYY-MM-DD; conversion never goes through UTC. */
export function isoToPersian(value: string): JalaaliDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid date key');
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid date key');
  return toJalaali(Number(match[1]), Number(match[2]), Number(match[3]));
}
export function persianToIso({ jy, jm, jd }: JalaaliDate): string {
  if (![jy, jm, jd].every(Number.isInteger) || !isValidJalaaliDate(jy, jm, jd)) throw new Error('Invalid Persian date');
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${String(gy).padStart(4, '0')}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

/** Selection is staged until confirmed so a diary with unsaved work is not switched three times. */
export function PersianDateInput({ value, onChange, label, max, disabled = false }: {
  value: string; onChange: (value: string) => void; label: string; max?: string; disabled?: boolean;
}) {
  const current = isoToPersian(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const years = Array.from({ length: 126 }, (_, i) => Math.max(1, current.jy - 110) + i).filter((year) => year < 3178);
  const iso = persianToIso(draft);
  const outOfRange = Boolean(max && iso > max);
  function changePart(part: 'jy' | 'jm' | 'jd', next: number) {
    setDraft((previous) => {
      const candidate = { ...previous, [part]: next };
      return { ...candidate, jd: Math.min(candidate.jd, jalaaliMonthLength(candidate.jy, candidate.jm)) };
    });
  }
  return <div className="persian-date">
    <button type="button" className="persian-date__trigger" aria-label={label} aria-expanded={open} disabled={disabled} data-iso-date={value}
      onClick={() => { if (!open) setDraft(current); setOpen(!open); }}>
      <CalendarDays size={17} aria-hidden="true" /><span>{faDigits(`${current.jy}/${String(current.jm).padStart(2, '0')}/${String(current.jd).padStart(2, '0')}`)}</span>
    </button>
    {open && <div className="persian-date__picker" role="group" aria-label={`انتخاب ${label} شمسی`}>
      <div className="persian-date__parts">
        <label><span>روز</span><select disabled={disabled} aria-label="روز شمسی" value={draft.jd} onChange={(e) => changePart('jd', Number(e.target.value))}>
          {Array.from({ length: jalaaliMonthLength(draft.jy, draft.jm) }, (_, i) => i + 1).map((day) => <option value={day} key={day}>{faDigits(day)}</option>)}
        </select></label>
        <label><span>ماه</span><select disabled={disabled} aria-label="ماه شمسی" value={draft.jm} onChange={(e) => changePart('jm', Number(e.target.value))}>
          {MONTHS.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
        </select></label>
        <label><span>سال</span><select disabled={disabled} aria-label="سال شمسی" value={draft.jy} onChange={(e) => changePart('jy', Number(e.target.value))}>
          {years.map((year) => <option value={year} key={year}>{faDigits(year)}</option>)}
        </select></label>
      </div>
      {outOfRange && <p className="persian-date__error" role="status">تاریخ نمی‌تواند بعد از امروز باشد.</p>}
      <div className="persian-date__actions">
        <button type="button" className="button button--primary button--small" disabled={disabled || outOfRange} onClick={() => { setOpen(false); onChange(iso); }}>انتخاب تاریخ</button>
        <button type="button" className="button button--ghost button--small" disabled={disabled} onClick={() => setOpen(false)}>انصراف</button>
      </div>
    </div>}
  </div>;
}
