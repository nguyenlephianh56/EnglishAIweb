import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatNumber } from "../../utils/format";
import type { AiUsage } from "../../types/admin";

export default function AiUsageCard({ usage }: { usage: AiUsage }) {
  const percent = usage.limit > 0 ? Math.round((usage.used / usage.limit) * 100) : 0;
  const data = [
    { name: "Đã dùng", value: usage.used, color: "var(--color-secondary)" },
    { name: "Còn lại", value: Math.max(usage.limit - usage.used, 0), color: "#CCFBF1" },
  ];
  const legend = [
    { label: "Chấm bài", value: usage.breakdown.grading, dot: "bg-brand" },
    { label: "Tạo bài", value: usage.breakdown.generation, dot: "bg-secondary" },
    { label: "Phân tích", value: usage.breakdown.analysis, dot: "bg-amber-400" },
  ];

  return (
    <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-ai-usage">
      <h2 id="h-ai-usage" className="font-heading text-xl font-bold text-slate-900">
        Sử dụng AI hôm nay
      </h2>
      <p className="mt-1 text-sm text-slate-500">Hạn mức {formatNumber(usage.limit)} lượt/ngày</p>

      <div className="relative mx-auto mt-6 size-52" role="img" aria-label={`Đã dùng ${percent}% hạn mức, ${formatNumber(usage.used)} lượt`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius="76%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-4xl font-extrabold text-slate-900">{percent}%</span>
          <span className="text-xs text-slate-500">{formatNumber(usage.used)} lượt</span>
        </div>
      </div>

      <ul className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-2 pt-6 text-xs text-slate-500">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${l.dot}`} aria-hidden="true" />
            {l.label}
            <strong className="font-bold text-slate-900">{formatNumber(l.value)}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
