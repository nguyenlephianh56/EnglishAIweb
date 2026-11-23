import { Sparkles } from "lucide-react";
import { ANY_SKILL_META } from "../student/skillMeta";
import { STATUS_BADGE } from "../teacher/exercises/exerciseMeta";
import type { ExerciseListItem } from "../../types/exercise";

export function SkillBadge({ skill }: { skill: string }) {
  const meta = ANY_SKILL_META[skill as keyof typeof ANY_SKILL_META] ?? ANY_SKILL_META.FOUNDATION;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${meta.tint} ${meta.text}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: ExerciseListItem["status"] }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const b = STATUS_BADGE[status];
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${b.className}`}>{b.label}</span>;
}

/** Nguồn tạo bài: AI / giáo viên / quản trị viên */
export function SourceBadge({ source }: { source: ExerciseListItem["source"] }) {
  if (source === "AI")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
        <Sparkles className="size-3.5" aria-hidden="true" />
        AI
      </span>
    );
  if (source === "TEACHER") return <span className="inline-block rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">Giáo viên</span>;
  if (source === "ADMIN") return <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Quản trị</span>;
  return <span className="text-slate-400">—</span>;
}
