import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, ChevronDown, CircleAlert, Clock, Sparkles, Target, TrendingDown, TrendingUp, Users } from "lucide-react";
import Button from "../../../components/ui/Button";
import HeatmapGrid from "../../shared/charts/HeatmapGrid";
import { formatPercent } from "../../../utils/format";
import { useClassAnalytics } from "./useClassAnalytics";
import type { ClassAnalytics } from "../../../types/analytics";
import type { ClassSummary } from "../../../types/teacher";

// Recharts khá nặng: tải riêng khi vào trang Phân tích
const SkillRadarChart = lazy(() => import("../../shared/charts/SkillRadarChart"));
const TrendAreaChart = lazy(() => import("../../shared/charts/TrendAreaChart"));

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải" />;
}

function Card({ title, subtitle, badge, children, className = "", id }: { title: string; subtitle: string; badge?: ReactNode; children: ReactNode; className?: string; id: string }) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`} aria-labelledby={id}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-heading text-xl font-bold text-slate-900">
            {title}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ChartSkeleton({ height }: { height: number }) {
  return <div className="animate-pulse rounded-2xl bg-slate-100" style={{ height }} role="status" aria-label="Đang tải biểu đồ" />;
}

function InsightCard({ a, className }: { a: ClassAnalytics; className: string }) {
  const { insight } = a;
  const diff =
    insight.diffVsGrade > 0 ? `, cao hơn ${insight.diffVsGrade}% so với toàn khối` : insight.diffVsGrade < 0 ? `, thấp hơn ${Math.abs(insight.diffVsGrade)}% so với toàn khối` : ", tương đương toàn khối";
  return (
    <section className={`flex flex-col rounded-3xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-6 shadow-sm sm:p-8 ${className}`} aria-labelledby="an-insight">
      <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">
        <Sparkles className="size-4" aria-hidden="true" />
        AI phân tích
      </p>
      <h2 id="an-insight" className="mt-3 font-heading text-xl font-bold text-slate-900">
        Lớp cần củng cố {insight.topic}
      </h2>
      <p className="mt-2 text-sm text-slate-600">
        {insight.errorPercent}% học sinh mắc lỗi về {insight.topic} trong các bài gần nhất{diff}.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-slate-700">
        <li className="flex items-center gap-2.5">
          <Target className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          {insight.studentsNeedingPractice} học sinh cần luyện thêm
        </li>
        <li className="flex items-center gap-2.5">
          <Clock className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
          Đề xuất bài {insight.suggestedMinutes} phút
        </li>
      </ul>
      <div className="mt-auto pt-6">
        <Button to={`/teacher/assignments/new?classId=${a.classId}`} fullWidth rightIcon={<BookOpen />}>
          Giao bài đề xuất
        </Button>
      </div>
    </section>
  );
}

/** /teacher/analytics: Phân tích lớp học. Danh sách lớp THẬT, số liệu phân tích GIẢ (xem mock/analyticsData.ts). */
export default function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const wanted = Number(params.get("classId"));
  const { classes, isLoading, isError, refetch } = useClassAnalytics(undefined);

  // Lớp đang chọn: ?classId= hợp lệ, không thì lớp đầu tiên
  const selected: ClassSummary | undefined = classes.find((c) => c.id === wanted) ?? classes[0];
  const { data } = useClassAnalytics(selected?.id);

  function selectClass(id: string) {
    const next = new URLSearchParams(params);
    next.set("classId", id);
    setParams(next, { replace: true });
  }

  const up = (data?.trendDeltaPercent ?? 0) >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;
  const radarSummary = data ? `Biểu đồ radar năng lực trung bình lớp: ${data.radar.map((p) => `${p.axis} ${p.value}`).join(", ")}` : "";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Phân tích lớp học</h1>
          <p className="mt-2 text-slate-500">Hiểu rõ năng lực và xu hướng tiến bộ của học sinh.</p>
        </div>
        {classes.length > 0 && (
          <div className="relative">
            <label htmlFor="analytics-class" className="sr-only">
              Chọn lớp
            </label>
            <select
              id="analytics-class"
              value={selected?.id ?? ""}
              onChange={(e) => selectClass(e.target.value)}
              className="h-12 min-w-44 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-900 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          </div>
        )}
      </div>

      {isError ? (
        <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được danh sách lớp từ máy chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading ? (
        <div className="mt-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : !selected || !data ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <Users className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Thầy/cô chưa có lớp nào</p>
          <p className="mt-1 text-sm text-slate-500">Tạo lớp và thêm học sinh để xem phân tích.</p>
          <div className="mt-5">
            <Button to="/teacher/classes">Tạo lớp</Button>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          <p className="inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Đang dùng số liệu minh họa: backend chưa có API phân tích lớp.</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              id="an-radar"
              title="Năng lực trung bình lớp"
              subtitle="So với trung bình toàn khối"
              badge={
                <span className="shrink-0 rounded-full bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700">
                  {data.level.code} • {data.level.label}
                </span>
              }
            >
              <Suspense fallback={<ChartSkeleton height={300} />}>
                <SkillRadarChart data={data.radar} height={300} ariaLabel={radarSummary} />
              </Suspense>
            </Card>

            <Card
              id="an-trend"
              title="Xu hướng điểm số"
              subtitle="12 tuần gần đây"
              badge={
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${up ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                  <TrendIcon className="size-4" aria-hidden="true" />
                  {up ? "+" : "−"}
                  {formatPercent(Math.abs(data.trendDeltaPercent))}
                </span>
              }
            >
              <Suspense fallback={<ChartSkeleton height={300} />}>
                <TrendAreaChart data={data.trend} height={300} />
              </Suspense>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card id="an-heatmap" title="Bản đồ lỗi thường gặp" subtitle="Màu đậm thể hiện tần suất lỗi cao" className="lg:col-span-2">
              <HeatmapGrid rows={data.heatmap.rows} cols={data.heatmap.cols} values={data.heatmap.values} selectedCol={data.heatmap.selectedCol} caption="Tần suất lỗi thường gặp theo lớp (%)" />
            </Card>
            <InsightCard a={data} className="" />
          </div>
        </div>
      )}
    </div>
  );
}
