import { faNumber } from '../../lib/format';
import { roundTotals, type Targets, type Totals } from '../../lib/nutrition';

/** The four numbers for a meal, day or item. */
export function TotalsStrip({ totals, compact = false }: { totals: Totals; compact?: boolean }) {
  const rounded = roundTotals(totals);
  const cells: { label: string; value: string }[] = [
    { label: 'کالری', value: `${faNumber(rounded.kcal)} کیلوکالری` },
    { label: 'پروتئین', value: `${faNumber(rounded.protein)} گرم` },
    { label: 'چربی', value: `${faNumber(rounded.fat)} گرم` },
    { label: 'کربوهیدرات', value: `${faNumber(rounded.carbs)} گرم` },
  ];
  return (
    <dl className={`nutrition-totals${compact ? ' nutrition-totals--compact' : ''}`}>
      {cells.map((cell) => (
        <div key={cell.label}>
          <dt>{cell.label}</dt>
          <dd>{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Each target the coach set, with how far the day's total is from it. Targets left empty are not shown. */
export function TargetBars({ totals, targets }: { totals: Totals; targets: Targets }) {
  const rows: { label: string; unit: string; actual: number; target: number }[] = [];
  if (targets.kcal) rows.push({ label: 'کالری', unit: 'کیلوکالری', actual: totals.kcal, target: targets.kcal });
  if (targets.proteinG) rows.push({ label: 'پروتئین', unit: 'گرم', actual: totals.protein, target: targets.proteinG });
  if (targets.carbsG) rows.push({ label: 'کربوهیدرات', unit: 'گرم', actual: totals.carbs, target: targets.carbsG });
  if (targets.fatG) rows.push({ label: 'چربی', unit: 'گرم', actual: totals.fat, target: targets.fatG });
  if (rows.length === 0) return null;
  return (
    <ul className="target-bars">
      {rows.map((row) => {
        const percent = Math.min(100, Math.round((row.actual / row.target) * 100));
        return (
          <li key={row.label}>
            <div className="target-bars__head">
              <span>{row.label}</span>
              <span>{faNumber(Math.round(row.actual * 10) / 10)} از {faNumber(row.target)} {row.unit} · {faNumber(percent)}٪</span>
            </div>
            <div className="target-bars__track" role="progressbar" aria-label={row.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <span style={{ width: `${percent}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
