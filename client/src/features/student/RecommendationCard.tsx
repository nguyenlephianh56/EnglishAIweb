import { ArrowRight, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import { ANY_SKILL_META } from "./skillMeta";
import { errorLabel } from "./mapSkillProfile";
import type { RecommendationItem } from "../../types/recommendation";

/** Lời giải thích vì sao bài này được gợi ý */
function describe(r: RecommendationItem): string {
  const skill = (ANY_SKILL_META[r.exercise.skill] ?? ANY_SKILL_META.FOUNDATION).label;
  const base = r.reason === "weakest_skill" ? `Đây là kỹ năng ${skill} bạn đang yếu nhất.` : `Bạn chưa có dữ liệu kỹ năng ${skill}, hãy thử bài này.`;
  return r.focus_error_type ? `${base} Bạn hay mắc lỗi ${errorLabel(r.focus_error_type)}.` : base;
}

export default function RecommendationCard({ recommendation: r }: { recommendation: RecommendationItem | null }) {
  const skill = r ? (ANY_SKILL_META[r.exercise.skill] ?? ANY_SKILL_META.FOUNDATION) : null;
  const SkillIcon = skill?.icon;

  return (
    <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-recommend">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="h-recommend" className="font-heading text-xl font-bold text-slate-900">
            Gợi ý cho bạn
          </h2>
          <p className="mt-1 text-sm text-slate-500">Dựa trên điểm yếu gần đây</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-light text-brand" aria-hidden="true">
          <Sparkles className="size-5" />
        </span>
      </div>

      {r && skill && SkillIcon ? (
        <>
          <div className="mt-6 flex flex-1 items-start gap-4">
            <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${skill.tint} ${skill.text}`} aria-hidden="true">
              <SkillIcon className="size-7" />
            </span>
            <div>
              <p className={`text-[11px] font-bold tracking-widest ${skill.text}`}>AI ĐỀ XUẤT</p>
              <h3 className="mt-1 font-heading text-lg font-bold text-slate-900">{r.exercise.topic}</h3>
              <p className="mt-1 text-sm text-slate-500">{describe(r)}</p>
              <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{skill.label}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{r.exercise.level}</span>
              </p>
            </div>
          </div>
          <div className="mt-6">
            <Button to={`/student/library/${r.exercise.id}`} variant="secondary" size="lg" fullWidth rightIcon={<ArrowRight />}>
              Làm bài
            </Button>
          </div>
        </>
      ) : (
        <div className="mt-6 flex-1 text-sm text-slate-500">
          <p>Chưa có bài gợi ý, hãy vào Thư viện để luyện tập.</p>
          <div className="mt-3">
            <Button to="/student/library" variant="outline" size="sm" rightIcon={<ArrowRight />}>
              Vào Thư viện
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
