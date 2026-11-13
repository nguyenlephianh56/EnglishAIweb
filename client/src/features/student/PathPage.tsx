import { CircleAlert, Route, Sparkles, Target } from "lucide-react";
import Button from "../../components/ui/Button";
import PathStageCard from "./PathStageCard";
import { pathProgress, useLearningPath } from "./usePath";
import type { LearningPath } from "../../types/path";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

export default function PathPage() {
  const { data, isLoading, isError, refetch } = useLearningPath();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Lộ trình học</h1>
      <p className="mt-2 text-slate-500">Kế hoạch học tập cá nhân hóa dựa trên điểm yếu của bạn.</p>

      {isError ? (
        <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được lộ trình học.
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading || !data ? (
        <div className="mt-8 space-y-6" role="status" aria-label="Đang tải">
          <div className="grid gap-5 lg:grid-cols-3">
            <Skeleton className="h-44 lg:col-span-2" />
            <Skeleton className="h-44" />
          </div>
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      ) : data.stages.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <Route className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Bạn chưa có lộ trình học</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Hãy làm vài bài luyện tập để AI hiểu trình độ của bạn và tạo lộ trình phù hợp.</p>
          <div className="mt-5">
            <Button to="/student/library">Đến thư viện luyện tập</Button>
          </div>
        </div>
      ) : (
        <PathContent path={data} />
      )}
    </div>
  );
}

function PathContent({ path }: { path: LearningPath }) {
  const overall = pathProgress(path);
  const weeklyPercent = path.weeklyGoal.total === 0 ? 0 : Math.round((path.weeklyGoal.done / path.weeklyGoal.total) * 100);

  return (
    <>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">
        <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-dark via-brand to-indigo-500 p-6 text-white shadow-lg shadow-brand/20 sm:p-8 lg:col-span-2" aria-labelledby="path-goal">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" aria-hidden="true" />
          <div className="relative">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Route className="size-4" aria-hidden="true" />
              Mục tiêu của bạn
            </p>
            <h2 id="path-goal" className="mt-3 font-heading text-4xl font-extrabold">
              {path.fromLevel} <span aria-label="lên">→</span> {path.toLevel}
            </h2>
            <p className="mt-2 text-sm text-indigo-100">
              {overall.done}/{overall.total} bài đã hoàn thành • còn khoảng {remainingMinutes(path)} phút học
            </p>
            <div className="mt-5 flex items-center gap-4">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall.percent} aria-label="Tiến độ lộ trình">
                <div className="h-full rounded-full bg-white" style={{ width: `${overall.percent}%` }} />
              </div>
              <span className="font-heading text-xl font-extrabold">{overall.percent}%</span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="path-weekly">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-light text-brand" aria-hidden="true">
            <Target className="size-6" />
          </span>
          <h2 id="path-weekly" className="mt-4 font-heading text-lg font-bold text-slate-900">
            Mục tiêu tuần
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {path.weeklyGoal.done} / {path.weeklyGoal.total} bài đã hoàn thành
          </p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={weeklyPercent} aria-label="Tiến độ mục tiêu tuần">
              <div className="h-full rounded-full bg-secondary" style={{ width: `${weeklyPercent}%` }} />
            </div>
            <span className="text-sm font-extrabold text-brand">{weeklyPercent}%</span>
          </div>
        </section>
      </div>

      <h2 className="mt-10 font-heading text-xl font-bold text-slate-900">Các chặng của bạn</h2>
      <ol className="mt-5" aria-label="Các chặng trong lộ trình">
        {path.stages.map((stage, index) => (
          <PathStageCard key={stage.id} stage={stage} number={index + 1} isLast={index === path.stages.length - 1} />
        ))}
      </ol>

      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Sparkles className="size-4 text-violet-500" aria-hidden="true" />
        Lộ trình được AI cập nhật sau mỗi bài làm.
      </p>
    </>
  );
}

/** Tổng số phút của các bài chưa làm */
function remainingMinutes(path: LearningPath): number {
  return path.stages.reduce((sum, stage) => sum + stage.lessons.filter((l) => !l.done).reduce((s, l) => s + l.minutes, 0), 0);
}
