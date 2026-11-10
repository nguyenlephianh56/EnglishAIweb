import { ArrowRight, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import { SKILL_META } from "./skillMeta";
import type { Recommendation } from "../../types/student";

export default function RecommendationCard({ recommendation: r }: { recommendation: Recommendation | null }) {
  const skill = r ? SKILL_META[r.skill] : null;
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
              <h3 className="mt-1 font-heading text-lg font-bold text-slate-900">{r.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{r.description}</p>
              <p className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{r.level}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{r.minutes} phút</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1">{r.topic}</span>
              </p>
            </div>
          </div>
          <div className="mt-6">
            {/* TODO: trỏ thẳng tới bài được gợi ý khi có route làm bài */}
            <Button to="/student/library" variant="secondary" size="lg" fullWidth rightIcon={<ArrowRight />}>
              Bắt đầu luyện
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-6 flex-1 text-sm text-slate-500">Chưa có gợi ý. Hãy làm thêm vài bài để AI hiểu rõ điểm mạnh và điểm yếu của bạn.</p>
      )}
    </section>
  );
}
