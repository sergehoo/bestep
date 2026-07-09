/**
 * BarSeriesChart.tsx — BarChart horizontal réutilisable (top courses etc).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Datum {
  label: string;
  value: number;
}

interface BarSeriesChartProps {
  data: Datum[];
  height?: number;
  color?: 'primary' | 'accent';
  ariaLabel?: string;
}

const COLORS = {
  primary: '#0284c7',
  accent: '#eab308',
};

export function BarSeriesChart({
  data,
  height = 240,
  color = 'primary',
  ariaLabel,
}: BarSeriesChartProps) {
  return (
    <div aria-label={ariaLabel} role="img">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#0f172a', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={140}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              fontSize: 12,
            }}
            cursor={{ fill: 'rgba(2, 132, 199, 0.05)' }}
          />
          <Bar dataKey="value" fill={COLORS[color]} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
