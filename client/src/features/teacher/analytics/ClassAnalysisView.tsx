import { BookOpen } from "lucide-react";
import Button from "../../../components/ui/Button";
import { ANY_SKILL_META } from "../../student/skillMeta";
import AiInsightCard from "./AiInsightCard";
import AnalysisCard from "./AnalysisCard";
import LimitedDataNote from "./LimitedDataNote";
import SkillRadarSection from "./SkillRadarSection";
import TopErrorsCard from "./TopErrorsCard";
import { ANALYSIS_SKILLS, toPercent } from "./analysisMeta";
import type { ClassAnalysis, ClassSkillStat } from "../../../types/analysis";
import type { LibrarySkill } from "../../../types/library";

const LEVELS = [
  { key: "A1", label: "A1", bar: "bg-sky-300" },
  { key: "A2", label: "A2", bar: "bg-sky-500" },
  { key: "B1", label: "B1", bar: "bg-indigo-500" },
  { key: "B2", label: "B2", bar: "bg-violet-600" },
  { key: "unassigned", label: "Chưa xếp", bar: "bg-slate-300" },
] as const;

/** Thanh chồng tỉ lệ phân bố cấp độ của một kỹ năng */
function LevelBar({ dist }: { dist: ClassSkillStat["level_distribution"] }) {
  const total = LEVELS.reduce((s, l) => s + (dist[l.key] ?? 0), 0);
  const summary = LEVELS.map((l) => `${l.label}: ${dist[l.key] ?? 0}`).join(", ");
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Phân bố cấp độ — ${summary}`}>
        {total > 0 && LEVELS.map((l) => ((dist[l.key] ?? 0) > 0 ? <span key={l.key} className={`${l.bar} h-full`} style={{ width: `${((dist[l.key] ?? 0) / total) * 100}%` }} title={`${l.label}: ${dist[l.key]}`} /> : null))}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-semibold text-slate-500">
        {LEVELS.filter((l) => (dist[l.key] ?? 0) > 0).map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1">
            <span className={`size-2 rounded-full ${l.bar}`} aria-hidden="true" />
            {l.label} {dist[l.key]}
          </span>
        ))}
      </p>
    </div>
  );
}

function SkillStatCard({ skill, stat }: { skill: LibrarySkill; stat: ClassSkillStat | null }) {
  const meta = ANY_SKILL_META[skill];
  const Icon = meta.icon;
  return (
    <li className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.tint} ${meta.text}`}>
          <Icon className="size-3.5" aria-hidden="true" />
          {meta.label}
        </span>
        {stat ? (
          <span className="font-heading text-2xl font-extrabold text-slate-900">
            {toPercent(stat.average_score)}
            <span className="text-xs font-semibold text-slate-400">/100</span>
          </span>
        ) : (
          <span className="text-xs font-semibold text-slate-400">Chưa có dữ liệu</span>
        )}
      </div>
      {stat && (
        <>
          <p className="mt-1 text-xs text-slate-500">{stat.students_with_data} học sinh có dữ liệu</p>
          <div className="mt-3">
            <LevelBar dist={stat.level_distribution} />
          </div>
        </>
      )}
    </li>
  );
}

/** Kết quả phân tích của một lớp: radar, từng kỹ năng, lỗi thường gặp, nhận xét AI. */
export default function ClassAnalysisView({ result, classId }: { result: ClassAnalysis; classId: number }) {
  const { skills, top_errors, limited_data } = result.stats;
  const scores = Object.fromEntries(ANALYSIS_SKILLS.map(({ skill }) => [skill, skills[skill]?.average_score ?? null])) as Record<LibrarySkill, number | null>;

  return (
    <div className="space-y-6">
      <LimitedDataNote show={limited_data} />

      <div className="grid gap-6 lg:grid-cols-2">
        <AnalysisCard id="an-radar" title="Năng lực trung bình lớp" subtitle="Điểm trung bình theo kỹ năng (0–100)">
          <SkillRadarSection scores={scores} subject="trung bình lớp" />
        </AnalysisCard>

        <AnalysisCard id="an-skills" title="Chi tiết từng kỹ năng" subtitle="Điểm trung bình và phân bố cấp độ học sinh">
          <ul className="grid gap-3 sm:grid-cols-2">
            {ANALYSIS_SKILLS.map(({ skill }) => (
              <SkillStatCard key={skill} skill={skill} stat={skills[skill]} />
            ))}
          </ul>
        </AnalysisCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <TopErrorsCard errors={top_errors} subtitle="Các loại lỗi học sinh trong lớp mắc nhiều nhất" className="lg:col-span-2" />
        <AiInsightCard
          analysis={result.analysis}
          className="lg:col-span-3"
          action={
            <Button to={`/teacher/assignments/new?classId=${classId}`} rightIcon={<BookOpen />}>
              Giao bài ôn tập
            </Button>
          }
        />
      </div>
    </div>
  );
}
