import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { errorLabel } from "../../student/mapSkillProfile";
import { ANY_SKILL_META } from "../../student/skillMeta";
import type { AnalysisText } from "../../../types/analysis";
import type { LibrarySkill } from "../../../types/library";

function SkillChip({ skill }: { skill: LibrarySkill }) {
  const meta = ANY_SKILL_META[skill] ?? ANY_SKILL_META.FOUNDATION;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.tint} ${meta.text}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {ANY_SKILL_META[skill] ? meta.label : String(skill)}
    </span>
  );
}

/** Kết quả AI: tóm tắt, điểm yếu, gợi ý. `action` là nút hành động ở cuối (ví dụ "Giao bài ôn tập"). */
export default function AiInsightCard({ analysis, action, className = "" }: { analysis: AnalysisText; action?: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-6 shadow-sm sm:p-8 ${className}`} aria-labelledby="an-ai">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
        <Sparkles className="size-4" aria-hidden="true" />
        AI phân tích
      </p>
      <h2 id="an-ai" className="mt-3 font-heading text-xl font-bold text-slate-900">
        Nhận xét tổng quan
      </h2>
      <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{analysis.summary}</p>

      {analysis.weaknesses.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-bold text-slate-900">Điểm yếu</h3>
          <ul className="mt-2 space-y-3">
            {analysis.weaknesses.map((w, i) => (
              <li key={i} className="rounded-2xl bg-white/80 p-3 text-sm text-slate-700 ring-1 ring-amber-100">
                <p className="flex flex-wrap items-center gap-2">
                  <SkillChip skill={w.skill} />
                  {w.error_type && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{errorLabel(w.error_type)}</span>}
                </p>
                <p className="mt-2 leading-6">{w.description}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {analysis.suggestions.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-bold text-slate-900">Gợi ý</h3>
          <ul className="mt-2 space-y-3">
            {analysis.suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700">
                {s.skill ? <SkillChip skill={s.skill} /> : <span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {action && <div className="mt-auto pt-6">{action}</div>}
    </section>
  );
}
