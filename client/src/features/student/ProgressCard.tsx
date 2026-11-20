import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProgressPoint } from "../../types/profile";
import type { SkillKey } from "../../types/student";
import { SKILL_META } from "./skillMeta";

const ORDER: SkillKey[] = ["LISTENING", "SPEAKING", "READING", "WRITING"];
const COLOR: Record<SkillKey, string> = {
  LISTENING: "var(--color-skill-listening)",
  SPEAKING: "var(--color-skill-speaking)",
  READING: "var(--color-skill-reading)",
  WRITING: "var(--color-skill-writing)",
};
const tick = { fill: "#94A3B8", fontSize: 11 };

export default function ProgressCard({ points }: { points: ProgressPoint[] }) {
  const last = points[points.length - 1];
  const summary = last ? ORDER.map((k) => `${SKILL_META[k].label} ${last[k] ?? "chưa có dữ liệu"}`).join(", ") : "";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-progress" className="font-heading text-xl font-bold text-slate-900">
            Tiến bộ theo thời gian
          </h2>
          <p className="mt-1 text-sm text-slate-500">Điểm từng kỹ năng qua các mốc trong khoảng thời gian đã chọn</p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
          {ORDER.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${SKILL_META[k].bar}`} aria-hidden="true" />
              {SKILL_META[k].label}
            </li>
          ))}
        </ul>
      </div>

      {points.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Chưa có điểm nào trong khoảng thời gian này.</p>
      ) : (
      <div className="mt-6" role="img" aria-label={last ? `Biểu đồ đường tiến bộ. Mốc gần nhất: ${summary}.` : "Biểu đồ đường tiến bộ: chưa có dữ liệu"}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} minTickGap={12} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={tick} tickLine={false} axisLine={false} width={44} />
            <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
            {ORDER.map((k) => (
              <Line key={k} type="monotone" dataKey={k} name={SKILL_META[k].label} stroke={COLOR[k]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </section>
  );
}
