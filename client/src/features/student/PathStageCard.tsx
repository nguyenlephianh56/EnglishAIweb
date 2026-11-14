import { ArrowRight, Check, Circle, CircleCheck, Lock, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import { ANY_SKILL_META } from "./skillMeta";
import { stageProgress } from "./usePath";
import type { PathStage, StageStatus } from "../../types/path";

interface PathStageCardProps {
  stage: PathStage;
  /** Số thứ tự chặng, bắt đầu từ 1 */
  number: number;
  isLast: boolean;
}

const STATUS_CHIP: Record<StageStatus, { label: string; className: string }> = {
  DONE: { label: "Đã hoàn thành", className: "bg-green-100 text-green-700" },
  CURRENT: { label: "Đang học", className: "bg-brand text-white" },
  LOCKED: { label: "Chưa mở", className: "bg-slate-100 text-slate-500" },
};

function StageNode({ status, number }: { status: StageStatus; number: number }) {
  if (status === "DONE")
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-green-500 text-white" aria-hidden="true">
        <Check className="size-5" />
      </span>
    );
  if (status === "CURRENT")
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand text-sm font-extrabold text-white ring-4 ring-brand/20" aria-hidden="true">
        {number}
      </span>
    );
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-200 text-slate-400" aria-hidden="true">
      <Lock className="size-4" />
    </span>
  );
}

function LessonList({ stage }: { stage: PathStage }) {
  return (
    <ul className="space-y-1.5">
      {stage.lessons.map((lesson) => (
        <li key={lesson.id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          {lesson.done ? <CircleCheck className="size-5 shrink-0 text-green-500" aria-hidden="true" /> : <Circle className="size-5 shrink-0 text-slate-300" aria-hidden="true" />}
          <span className={`min-w-0 flex-1 text-sm font-semibold ${lesson.done ? "text-slate-500" : "text-slate-800"}`}>
            {lesson.title}
            <span className="sr-only">{lesson.done ? " (đã xong)" : " (chưa làm)"}</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-slate-400">{lesson.minutes} phút</span>
        </li>
      ))}
    </ul>
  );
}

/** Một chặng trên timeline: nút tròn trạng thái + đường nối + thẻ nội dung */
export default function PathStageCard({ stage, number, isLast }: PathStageCardProps) {
  const skill = ANY_SKILL_META[stage.skill];
  const SkillIcon = skill.icon;
  const progress = stageProgress(stage);
  const chip = STATUS_CHIP[stage.status];
  const locked = stage.status === "LOCKED";

  return (
    <li className="relative flex gap-4 sm:gap-5" aria-current={stage.status === "CURRENT" ? "step" : undefined}>
      <div className="flex flex-col items-center">
        <StageNode status={stage.status} number={number} />
        {!isLast && <span className={`mt-2 w-0.5 flex-1 rounded-full ${stage.status === "DONE" ? "bg-green-300" : "bg-slate-200"}`} aria-hidden="true" />}
      </div>

      <article
        className={`mb-6 min-w-0 flex-1 rounded-3xl border bg-white p-5 shadow-sm sm:p-6 ${
          stage.status === "CURRENT" ? "border-brand ring-4 ring-brand/10" : "border-slate-200"
        } ${locked ? "opacity-75" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${skill.tint} ${skill.text}`}>
            <SkillIcon className="size-3.5" aria-hidden="true" />
            {skill.label}
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${chip.className}`}>{chip.label}</span>
        </div>

        <h3 className="mt-3 font-heading text-lg font-bold text-slate-900">{stage.title}</h3>

        <p className="mt-2 flex items-start gap-2 text-sm text-slate-500">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-500" aria-hidden="true" />
          <span>
            <strong className="font-bold text-slate-700">Vì sao bạn học chặng này: </strong>
            {stage.reason}
          </span>
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {progress.done}/{progress.total} bài • {progress.minutes} phút
            </span>
            <span>{progress.percent}%</span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label={`Tiến độ chặng ${stage.title}`}
          >
            <div className={`h-full rounded-full ${stage.status === "DONE" ? "bg-green-500" : skill.bar}`} style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        {stage.status === "CURRENT" && (
          <>
            <div className="mt-4">
              <LessonList stage={stage} />
            </div>
            <div className="mt-5">
              <Button to={`/student/library?skill=${stage.skill}`} rightIcon={<ArrowRight />}>
                Tiếp tục
              </Button>
            </div>
          </>
        )}

        {stage.status === "DONE" && (
          <details className="group mt-4">
            <summary className="cursor-pointer select-none text-sm font-bold text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
              <span className="group-open:hidden">Xem các bài đã làm</span>
              <span className="hidden group-open:inline">Ẩn danh sách bài</span>
            </summary>
            <div className="mt-3">
              <LessonList stage={stage} />
            </div>
          </details>
        )}

        {locked && (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            Hoàn thành chặng trước để mở chặng này.
          </p>
        )}
      </article>
    </li>
  );
}
