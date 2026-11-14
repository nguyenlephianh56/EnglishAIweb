import { TrendingDown, TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import type { SkillProfileData } from "../../types/profile";

export default function RadarCard({ profile }: { profile: SkillProfileData }) {
  const up = profile.deltaPoints >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  const summary = profile.radar.map((a) => `${a.axis} ${a.value}`).join(", ");

  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-radar">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="h-radar" className="font-heading text-xl font-bold text-slate-900">
            Năng lực tổng quan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cấp độ hiện tại: {profile.level} • {profile.levelLabel}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${up ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          <TrendIcon className="size-4" aria-hidden="true" />
          {up ? "+" : "−"}
          {Math.abs(profile.deltaPoints)} điểm
        </span>
      </div>

      <div className="mt-2" role="img" aria-label={`Biểu đồ radar năng lực: ${summary}`}>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={profile.radar} outerRadius="72%">
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
    </section>
  );
}
