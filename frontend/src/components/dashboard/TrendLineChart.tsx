/**
 * TrendLineChart.tsx — LineChart réutilisable pour timeseries (R5.2).
 * Recharts + palette be-sky/be-sun cohérente.
 */
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SeriesPoint } from '@/lib/types';

interface TrendLineChartProps {
  data: SeriesPoint[];
  color?: 'primary' | 'accent' | 'success';
  height?: number;
  yLabel?: string;
  valueFormatter?: (v: number) => string;
  ariaLabel?: string;
}

const COLORS = {
  primary: '#0284c7', // be-sky-600
  accent: '#eab308',  // be-sun-500
  success: '#059669', // emerald-600
};

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  } catch {
    return iso;
  }
}

export function TrendLineChart({
  data,
  color = 'primary',
  height = 220,
  yLabel,
  valueFormatter,
  ariaLabel,
}: TrendLineChartProps) {
  const stroke = COLORS[color];
  const gradientId = `gradient-${color}`;

  return (
    <div aria-label={ariaLabel} role="img">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.3} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={40}
            label={
              yLabel
                ? { value: yLabel, angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }
                : undefined
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(label) => {
              try {
                return new Date(label as string).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                });
              } catch {
                return label;
              }
            }}
            formatter={(v) => [
              valueFormatter ? valueFormatter(v as number) : v,
              yLabel ?? 'Valeur',
            ]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
