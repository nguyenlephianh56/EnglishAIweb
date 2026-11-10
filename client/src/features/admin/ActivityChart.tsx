import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "../../utils/format";
import type { ActivityPoint } from "../../types/admin";

const axisTick = { fill: "#94A3B8", fontSize: 11 };

export default function ActivityChart({ data, days }: { data: ActivityPoint[]; days: number }) {
  const last = data[data.length - 1];

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-activity">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-activity" className="font-heading text-xl font-bold text-slate-900">
            Hoạt động người dùng
          </h2>
          <p className="mt-1 text-sm text-slate-500">Lượt học và chấm AI trong {days} ngày</p>
        </div>
        <p className="flex items-center gap-4 text-xs font-semibold text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-secondary" aria-hidden="true" />
            Người dùng
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-brand" aria-hidden="true" />
            Lượt AI
          </span>
        </p>
      </div>

      <div
        className="mt-6"
        role="img"
        aria-label={`Biểu đồ vùng ${days} ngày. Ngày gần nhất: ${formatNumber(last.users)} người dùng, ${formatNumber(last.aiCalls)} lượt AI.`}
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="fill-users" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-secondary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-secondary)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fill-ai" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-brand)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="var(--color-brand)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} width={48} />
            <Tooltip formatter={(value, name) => [formatNumber(Number(value)), name]} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
            <Area type="monotone" dataKey="aiCalls" name="Lượt AI" stroke="var(--color-brand)" strokeWidth={2} fill="url(#fill-ai)" />
            <Area type="monotone" dataKey="users" name="Người dùng" stroke="var(--color-secondary)" strokeWidth={2.5} fill="url(#fill-users)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
