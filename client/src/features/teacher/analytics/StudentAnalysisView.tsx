import AiInsightCard from "./AiInsightCard";
import AnalysisCard from "./AnalysisCard";
import LimitedDataNote from "./LimitedDataNote";
import SkillRadarSection from "./SkillRadarSection";
import TopErrorsCard from "./TopErrorsCard";
import { ANALYSIS_SKILLS, toPercent } from "./analysisMeta";
import { ANY_SKILL_META } from "../../student/skillMeta";
import type { StudentAnalysis } from "../../../types/analysis";
import type { LibrarySkill } from "../../../types/library";

/** Kết quả phân tích của một học sinh: radar + điểm từng kỹ năng (kèm cấp độ), lỗi thường gặp, nhận xét AI. */
export default function StudentAnalysisView({ result }: { result: StudentAnalysis }) {
  const { skills, top_errors, limited_data } = result.stats;
  const scores = Object.fromEntries(ANALYSIS_SKILLS.map(({ skill }) => [skill, skills[skill]?.score ?? null])) as Record<LibrarySkill, number | null>;

  return (
    <div className="space-y-5">
      <LimitedDataNote show={limited_data} />

      <AnalysisCard id="an-radar" title="Năng lực theo kỹ năng" subtitle="Điểm 0–100 và cấp độ từng kỹ năng">
        <SkillRadarSection scores={scores} subject={result.target.name} />
        <ul className="mt-4 divide-y divide-slate-100">
          {ANALYSIS_SKILLS.map(({ skill }) => {
            const meta = ANY_SKILL_META[skill];
            const stat = skills[skill];
            return (
              <li key={skill} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                <span className={`inline-flex items-center gap-1.5 font-bold ${meta.text}`}>
                  <meta.icon className="size-4" aria-hidden="true" />
                  {meta.label}
                </span>
                {stat ? (
                  <span className="flex items-center gap-3">
                    {stat.level && <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-bold text-green-700">{stat.level}</span>}
                    <span className="font-bold text-slate-900">{toPercent(stat.score)}/100</span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400">Chưa có dữ liệu</span>
                )}
              </li>
            );
          })}
        </ul>
      </AnalysisCard>

      <TopErrorsCard errors={top_errors} subtitle="Các loại lỗi học sinh này mắc nhiều nhất" />
      <AiInsightCard analysis={result.analysis} />
    </div>
  );
}
