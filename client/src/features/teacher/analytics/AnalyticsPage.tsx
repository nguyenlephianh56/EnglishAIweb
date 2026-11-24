import { useSearchParams } from "react-router-dom";
import { ChevronDown, CircleAlert, Sparkles, Users } from "lucide-react";
import Button from "../../../components/ui/Button";
import AnalysisToolbar from "./AnalysisToolbar";
import ClassAnalysisView from "./ClassAnalysisView";
import { useClassAnalysis } from "./useAnalysis";
import { useTeacherClasses } from "../useTeacherData";
import type { ClassSummary } from "../../../types/teacher";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải" />;
}

/** /teacher/analytics: Phân tích lớp bằng AI. Danh sách lớp THẬT (GET /classes); phân tích chạy khi bấm nút (POST /analysis/classes/:id). */
export default function AnalyticsPage() {
  const [params, setParams] = useSearchParams();
  const wanted = Number(params.get("classId"));
  const classesQuery = useTeacherClasses();
  const classes = classesQuery.data ?? [];

  // Lớp đang chọn: ?classId= hợp lệ, không thì lớp đầu tiên
  const selected: ClassSummary | undefined = classes.find((c) => c.id === wanted) ?? classes[0];

  function selectClass(id: string) {
    const next = new URLSearchParams(params);
    next.set("classId", id);
    setParams(next, { replace: true });
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Phân tích lớp học</h1>
          <p className="mt-2 text-slate-500">AI tổng hợp năng lực, lỗi thường gặp và gợi ý ôn tập cho cả lớp.</p>
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

      {classesQuery.isError ? (
        <div role="alert" className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được danh sách lớp từ máy chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => void classesQuery.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : classesQuery.isLoading ? (
        <div className="mt-8 space-y-6">
          <Skeleton className="h-24" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      ) : !selected ? (
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
        <ClassPanel key={selected.id} classId={selected.id} className={selected.name} />
      )}
    </div>
  );
}

/** Kết quả (hoặc màn chờ phân tích) của MỘT lớp */
function ClassPanel({ classId, className }: { classId: number; className: string }) {
  const { result, running, busy, errorMessage, run } = useClassAnalysis(classId);

  return (
    <div className="mt-8 space-y-6">
      <AnalysisToolbar generatedAt={result?.generated_at} running={running} busy={busy} errorMessage={errorMessage} onRun={run} startLabel="Phân tích lớp bằng AI" />
      {result ? (
        <ClassAnalysisView result={result} classId={classId} />
      ) : (
        !running && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-violet-50 text-violet-600" aria-hidden="true">
              <Sparkles className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">Chưa phân tích lớp “{className}”</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Mỗi lần phân tích mất 10–30 giây và tính vào lượt AI trong ngày của thầy/cô, nên chỉ chạy khi thầy/cô bấm nút.</p>
          </div>
        )
      )}
    </div>
  );
}
