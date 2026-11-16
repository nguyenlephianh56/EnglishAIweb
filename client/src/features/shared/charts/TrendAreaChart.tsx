import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendDatum {
  label: string;
  value: number;
}

interface TrendAreaChartProps {
  data: TrendDatum[];
  height?: number;
  /** Giá trị lớn nhất của trục Y; trục chia 4 khoảng đều (0/25/50/75/100 khi yMax = 100) */
  yMax?: number;
  /** Mô tả cho trình đọc màn hình; mặc định tự tóm tắt từ dữ liệu */
  ariaLabel?: string;
  className?: string;
}

function summarize(data: TrendDatum[]): string {
  if (data.length === 0) return "Biểu đồ xu hướng: chưa có dữ liệu";
  const first = data[0];
  const last = data[data.length - 1];
  const values = data.map((d) => d.value);
  return `Biểu đồ xu hướng: từ ${first.value} (${first.label}) đến ${last.value} (${last.label}), thấp nhất ${Math.min(...values)}, cao nhất ${Math.max(...values)}`;
}

/** Biểu đồ vùng với đường cong mượt, gradient indigo, lưới nét đứt. */
export default function TrendAreaChart({ data, height = 260, yMax = 100, ariaLabel, className }: TrendAreaChartProps) {
  const gradientId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ticks = [0, 1, 2, 3, 4].map((i) => Math.round((yMax / 4) * i * 100) / 100);

  return (
    <div className={className} role="img" aria-label={ariaLabel ?? summarize(data)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, yMax]} ticks={ticks} tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
          <Tooltip cursor={{ stroke: "#C7D2FE" }} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} formatter={(v) => [v, "Điểm"]} />
          <Area type="monotone" dataKey="value" stroke="var(--color-brand)" strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 5, fill: "#fff", stroke: "var(--color-brand)", strokeWidth: 2.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
