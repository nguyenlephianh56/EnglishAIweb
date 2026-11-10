import { ChevronDown } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { formatNumber } from "../../utils/format";
import type { ClassSummary, OnTimeStats } from "../../types/teacher";

interface OnTimeCardProps {
  classes: ClassSummary[];
  classId: number | "all";
  onClassChange: (id: number | "all") => void;
  stats: OnTimeStats;
}

const COLORS = { onTime: "#22C55E", late: "#F59E0B", missing: "#CBD5E1" };

export default function OnTimeCard({ classes, classId, onClassChange, stats }: OnTimeCardProps) {
  const total = stats.onTime + stats.late + stats.missing;
  const percent = total > 0 ? Math.round((stats.onTime / total) * 100) : 0;
  const rows = [
    { key: "onTime", label: "Đúng hạn", value: stats.onTime, color: COLORS.onTime },
    { key: "late", label: "Nộp trễ", value: stats.late, color: COLORS.late },
    { key: "missing", label: "Chưa nộp", value: stats.missing, color: COLORS.missing },
  ];
  const data = total > 0 ? rows : [{ key: "empty", label: "Chưa có dữ liệu", value: 1, color: "#E2E8F0" }];

  return (
    <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-ontime">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-ontime" className="font-heading text-xl font-bold text-slate-900">
            Tỷ lệ nộp đúng hạn
          </h2>
          <p className="mt-1 text-sm text-slate-500">Tổng hợp 30 ngày gần đây</p>
        </div>
        <div className="relative">
          <label htmlFor="ontime-class" className="sr-only">
            Chọn lớp
          </label>
          <select
            id="ontime-class"
            value={String(classId)}
            onChange={(e) => onClassChange(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
          >
            <option value="all">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-8 sm:flex-row">
        <div className="relative size-48 shrink-0" role="img" aria-label={total > 0 ? `${percent}% bài nộp đúng hạn` : "Chưa có dữ liệu nộp bài"}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius="76%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.key} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-heading text-4xl font-extrabold text-slate-900">{total > 0 ? `${percent}%` : "—"}</span>
            <span className="text-xs text-slate-500">đúng hạn</span>
          </div>
        </div>

        <ul className="w-full max-w-[14rem] space-y-3 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 text-slate-600">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden="true" />
              <span className="flex-1">{r.label}</span>
              <strong className="font-bold text-slate-900">{formatNumber(r.value)}</strong>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
