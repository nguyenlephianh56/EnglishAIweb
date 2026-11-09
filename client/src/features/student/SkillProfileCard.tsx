import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";
import Button from "../../components/ui/Button";
import type { SkillProfileSummary } from "../../types/student";

function deltaText(delta: number) {
  if (delta > 0) return `Tăng ${delta} điểm tháng này`;
  if (delta < 0) return `Giảm ${Math.abs(delta)} điểm tháng này`;
  return "Giữ nguyên so với tháng trước";
}

export default function SkillProfileCard({ profile }: { profile: SkillProfileSummary }) {
  const summary = profile.axes.map((a) => `${a.axis} ${a.value}`).join(", ");
  const up = profile.monthlyDelta >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-skill-profile">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="h-skill-profile" className="font-heading text-xl font-bold text-slate-900">
            Hồ sơ kỹ năng
          </h2>
          <p className="mt-1 text-sm text-slate-500">Cập nhật sau bài học gần nhất</p>
        </div>
        <span className="rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
          {profile.level} • {profile.levelLabel}
        </span>
      </div>

      <div className="mt-4 flex flex-1 flex-col items-center gap-6 sm:flex-row">
        <div className="w-full sm:flex-1" role="img" aria-label={`Biểu đồ radar năng lực: ${summary}`}>
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={profile.axes} outerRadius="68%">
              <PolarGrid stroke="#E2E8F0" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="var(--color-brand)"
                strokeWidth={2}
                fill="var(--color-brand)"
                fillOpacity={0.15}
                dot={{ r: 4, fill: "#fff", stroke: "var(--color-brand)", strokeWidth: 2 }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="w-full shrink-0 border-t border-slate-100 pt-5 sm:w-auto sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
          <p className="font-heading text-5xl font-extrabold text-slate-900">
            {profile.overall}
            <span className="text-lg font-semibold text-slate-400">/100</span>
          </p>
          <p className="mt-1 text-sm text-slate-500">Điểm năng lực tổng</p>
          <p
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              up ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            <TrendIcon className="size-4" aria-hidden="true" />
            {deltaText(profile.monthlyDelta)}
          </p>
          <div className="mt-3">
            <Button to="/student/profile" variant="ghost" size="sm" className="-ml-4" rightIcon={<ArrowRight />}>
              Xem hồ sơ chi tiết
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
