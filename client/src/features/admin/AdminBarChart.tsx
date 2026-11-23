import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatNumber } from "../../utils/format";

const tick = { fill: "#94A3B8", fontSize: 11 };

/** Biểu đồ cột đơn giản của các số đếm thật. */
export default function AdminBarChart({ title, subtitle, data, color, id }: { title: string; subtitle: string; data: { label: string; value: number }[]; color: string; id: string }) {
  const summary = data.map((d) => `${d.label} ${formatNumber(d.value)}`).join(", ");
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby={id}>
      <h2 id={id} className="font-heading text-xl font-bold text-slate-900">
        {title}
      </h2>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      <div className="mt-6" role="img" aria-label={`${title}: ${summary}`}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={44} />
            <Tooltip formatter={(v) => [formatNumber(Number(v)), "Số lượng"]} cursor={{ fill: "#F1F5F9" }} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
            <Bar dataKey="value" name="Số lượng" fill={color} radius={[8, 8, 0, 0]} maxBarSize={56} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
