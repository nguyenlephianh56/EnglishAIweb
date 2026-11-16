import { TrendingDown, TrendingUp } from "lucide-react";
import SkillRadarChart from "../shared/charts/SkillRadarChart";
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

      <SkillRadarChart className="mt-2" data={profile.radar} ariaLabel={`Biểu đồ radar năng lực: ${summary}`} />
    </section>
  );
}
