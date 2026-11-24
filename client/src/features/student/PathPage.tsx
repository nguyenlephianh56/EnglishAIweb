import { useState } from "react";
import { CircleAlert, Route, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import PathItemCard from "./PathItemCard";
import { createPathErrorMessage, pathPercent, useCreatePath, useLearningPath, useToggleItem } from "./usePath";
import type { LearningPathView } from "../../types/path";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "dd/MM – dd/MM" từ thứ Hai (YYYY-MM-DD) đến Chủ nhật. Dựng ngày theo giờ địa phương để không lệch múi giờ. */
function weekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  if (!y || !m || !d) return weekStart;
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (x: Date) => `${pad2(x.getDate())}/${pad2(x.getMonth() + 1)}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function PathPage() {
  const { data, isLoading, isError, refetch } = useLearningPath();

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Lộ trình tuần này</h1>
      <p className="mt-2 text-slate-500">
        {data ? `Tuần ${weekRange(data.week_start)}` : "Kế hoạch học tập mỗi tuần dựa trên điểm yếu của bạn."}
      </p>

      {isError ? (
        <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được lộ trình học.
          </span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading || data === undefined ? (
        <div className="mt-8 space-y-5" role="status" aria-label="Đang tải">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : data === null ? (
        <EmptyPath />
      ) : (
        <PathContent path={data} />
      )}
    </div>
  );
}

/** Tuần này chưa có lộ trình: tạo thường hoặc nhờ AI */
function EmptyPath() {
  const { basic, ai } = useCreatePath();
  const running = basic.isPending || ai.isPending;
  const error = basic.isError ? createPathErrorMessage(basic.error) : ai.isError ? createPathErrorMessage(ai.error) : null;

  function start(kind: "basic" | "ai") {
    basic.reset();
    ai.reset();
    (kind === "basic" ? basic : ai).mutate();
  }

  return (
    <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center sm:p-12">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
        <Route className="size-6" />
      </span>
      <p className="mt-3 font-heading text-lg font-bold text-slate-900">Tuần này bạn chưa có lộ trình</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Mỗi tuần bạn có một lộ trình, được tạo một lần dựa trên điểm yếu của bạn. Hãy tạo lộ trình cho tuần này.</p>

      {error && (
        <div className="mx-auto mt-5 max-w-md text-left">
          <Notice type="error">{error}</Notice>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button loading={basic.isPending} disabled={running} onClick={() => start("basic")} leftIcon={<Route />}>
          Tạo lộ trình
        </Button>
        <Button variant="outline" loading={ai.isPending} disabled={running} onClick={() => start("ai")} leftIcon={<Sparkles />}>
          Tạo bằng AI
        </Button>
      </div>
      {ai.isPending && (
        <p role="status" className="mt-4 text-sm font-semibold text-violet-700">
          AI đang soạn lộ trình, có thể mất 10–30 giây…
        </p>
      )}
    </div>
  );
}

function PathContent({ path }: { path: LearningPathView }) {
  const [error, setError] = useState<string | null>(null);
  const { toggle, busyIds } = useToggleItem((message) => setError(message));
  const percent = pathPercent(path.progress);

  return (
    <>
      <section className="relative mt-8 overflow-hidden rounded-3xl bg-linear-to-br from-brand-dark via-brand to-indigo-500 p-6 text-white shadow-lg shadow-brand/20 sm:p-8" aria-labelledby="path-progress">
        <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10" aria-hidden="true" />
        <div className="relative">
          <h2 id="path-progress" className="font-heading text-xl font-bold">
            Tiến độ tuần này
          </h2>
          <p className="mt-2 text-sm text-indigo-100">
            {path.progress.done}/{path.progress.total} mục hoàn thành
          </p>
          <div className="mt-5 flex items-center gap-4">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Tiến độ lộ trình tuần">
              <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <span className="font-heading text-xl font-extrabold">{percent}%</span>
          </div>
        </div>
      </section>

      <p className="mt-6 text-sm text-slate-500">Bấm vào ô tròn khi bạn đã hoàn thành mục này.</p>

      {error && (
        <div className="mt-4">
          <Notice type="error">{error}</Notice>
        </div>
      )}

      {path.items.length === 0 ? (
        <p className="mt-4 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Lộ trình tuần này chưa có mục nào.</p>
      ) : (
        <ul className="mt-4 space-y-4" aria-label="Các mục trong lộ trình tuần">
          {path.items.map((item) => (
            <li key={item.id}>
              <PathItemCard
                item={item}
                busy={busyIds.has(item.id)}
                onToggle={(i) => {
                  setError(null);
                  toggle(i.id, !i.done);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
