import { faNumber } from '../../lib/format';
import {
  DETAIL_NUTRIENTS,
  MAIN_NUTRIENTS,
  missingCounts,
  roundNutrient,
  type NutrientInfo,
  type PlanItem,
  type Targets,
  type Totals,
} from '../../lib/nutrition';

function formatNutrient(info: NutrientInfo, totals: Totals, items: PlanItem[], counts: ReturnType<typeof missingCounts>) {
  const missing = counts[info.key];
  if (items.length > 0 && missing === items.length) return { text: '—', partial: false };
  const value = faNumber(roundNutrient(info.key, totals[info.key]), { maximumFractionDigits: info.decimals });
  return { text: `${value} ${info.unit}`, partial: missing > 0 };
}

/**
 * The totals of a meal or a day. `items` are the foods they are made of, so a nutrient USDA
 * does not publish for some of them is marked instead of being shown as 0.
 */
export function TotalsStrip({ totals, items, compact = false }: { totals: Totals; items: PlanItem[]; compact?: boolean }) {
  const counts = missingCounts(items);
  const anyPartial = [...MAIN_NUTRIENTS, ...DETAIL_NUTRIENTS].some((info) => counts[info.key] > 0 && counts[info.key] < items.length);
  const renderCell = (info: NutrientInfo) => {
    const { text, partial } = formatNutrient(info, totals, items, counts);
    return (
      <div key={info.key}>
        <dt>{info.label}</dt>
        <dd>{text}{partial && <sup title="بعضی مواد این مقدار را در منبع USDA ندارند">*</sup>}</dd>
      </div>
    );
  };
  return (
    <div className={`nutrition-totals-block${compact ? ' nutrition-totals-block--compact' : ''}`}>
      <dl className={`nutrition-totals${compact ? ' nutrition-totals--compact' : ''}`}>{MAIN_NUTRIENTS.map(renderCell)}</dl>
      <details className="nutrition-details">
        <summary>سایر مواد مغذی</summary>
        <dl className="nutrition-totals nutrition-totals--detail">{DETAIL_NUTRIENTS.map(renderCell)}</dl>
      </details>
      {anyPartial && <p className="nutrition-note">* بعضی مواد در منبع USDA این مقدار را ندارند؛ جمع فقط مواردی است که داده دارند.</p>}
    </div>
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
