import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

export interface RadarDatum {
  axis: string;
  value: number;
}

interface SkillRadarChartProps {
  data: RadarDatum[];
  height?: number;
  /** Mô tả bằng chữ cho trình đọc màn hình, ví dụ "Biểu đồ radar năng lực: Nghe 70, ..." */
  ariaLabel: string;
  className?: string;
}

/** Biểu đồ radar 0–100 dùng chung (hồ sơ học sinh, phân tích lớp của giáo viên). */
export default function SkillRadarChart({ data, height = 340, ariaLabel, className }: SkillRadarChartProps) {
  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="#E2E8F0" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke="var(--color-brand)"
            strokeWidth={2.5}
            fill="var(--color-brand)"
            fillOpacity={0.15}
            dot={{ r: 5, fill: "#fff", stroke: "var(--color-brand)", strokeWidth: 2.5 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
