import { faNumber } from '../lib/format';

interface Point { label: string; value: number }

export function ProgressChart({ points, unit, label, color = 'var(--accent)' }: { points: Point[]; unit: string; label: string; color?: string }) {
  const width = 560;
  const height = 180;
  const padding = { top: 16, right: 15, bottom: 28, left: 35 };
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const range = maxValue - minValue || 1;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const coordinates = points.map((point, index) => ({
    x: padding.left + (points.length === 1 ? innerWidth / 2 : (points.length - 1 - index) * (innerWidth / (points.length - 1))),
    y: padding.top + innerHeight - ((point.value - minValue) / range) * innerHeight,
    ...point,
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
    </div>
  );
}
