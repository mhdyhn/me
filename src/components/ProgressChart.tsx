import { faNumber } from '../lib/format';

interface Point { label: string; value: number }

// Keep local minima and maxima in each bucket, as well as the first and last point.
export function sampleChartIndices(points: Point[], limit = 200): number[] {
  if (points.length <= limit || limit < 4) return points.map((_, index) => index);
  const result = [0];
  const buckets = Math.floor((limit - 2) / 2);
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = 1 + Math.floor((points.length - 2) * bucket / buckets);
    const end = 1 + Math.floor((points.length - 2) * (bucket + 1) / buckets);
    if (start >= end) continue;
    let min = start;
    let max = start;
    for (let index = start + 1; index < end; index++) {
      if (points[index]!.value < points[min]!.value) min = index;
      if (points[index]!.value > points[max]!.value) max = index;
    }
    result.push(Math.min(min, max));
    if (min !== max) result.push(Math.max(min, max));
  }
  result.push(points.length - 1);
  return result;
}

export function ProgressChart({ points, unit, label, color = 'var(--accent)' }: { points: Point[]; unit: string; label: string; color?: string }) {
  const width = 560;
  const height = 180;
  const padding = { top: 16, right: 15, bottom: 28, left: 35 };
  const minValue = points.length ? points.reduce((min, point) => Math.min(min, point.value), Infinity) : 0;
  const maxValue = points.length ? points.reduce((max, point) => Math.max(max, point.value), -Infinity) : 1;
  const displayIndices = sampleChartIndices(points);
  const range = maxValue - minValue || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coordinates = displayIndices.map((index) => ({
    x: padding.left + (points.length === 1 ? innerWidth / 2 : (points.length - 1 - index) * (innerWidth / (points.length - 1))),
    y: padding.top + innerHeight - ((points[index]!.value - minValue) / range) * innerHeight,
    ...points[index]!,
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(' ');
  const format = (value: number) => `${faNumber(Number(value.toFixed(1)), { maximumFractionDigits: 1 })}${unit}`;

  if (points.length === 0) {
    return <div className="chart-empty"><span>هنوز ستی ثبت نشده است</span><small>برای شروع ثبت روند، یک جلسه تمرین کن.</small></div>;
  }

  return (
    <div className="chart-wrap">
      <div className="chart-value-row"><strong>{format(points.at(-1)?.value ?? 0)}</strong><span>آخرین ثبت · {label}</span></div>
      <svg className="progress-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`نمودار روند ${label}`}>
        {[0, 0.5, 1].map((fraction) => {
          const y = padding.top + innerHeight * fraction;
          return <line key={fraction} x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="chart-gridline" />;
        })}
        {coordinates.length > 1 && <polyline points={polyline} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {coordinates.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="5" fill={color} stroke="var(--surface)" strokeWidth="3" />
            {(index === 0 || index === coordinates.length - 1 || coordinates.length <= 4) && (
              <text x={point.x} y={height - 4} textAnchor="middle" className="chart-label">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
      {displayIndices.length < points.length && <small className="field-hint">نمودار، خلاصه‌ای از {faNumber(points.length)} ثبت است؛ جزئیات کامل در سوابق در دسترس‌اند.</small>}
    </div>
  );
}
