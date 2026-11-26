import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import { formatScore } from "../exercises/shared/scoreFormat";
import { LEVEL_OPTIONS, SKILL_OPTIONS, TYPE_OPTIONS } from "./libraryFilters";
import {
  formatPracticeSubmissionTime,
  listPracticeHistory,
  PRACTICE_HISTORY_KEY,
} from "./practiceHistory";
import type { PracticeHistoryFilters } from "./practiceHistory";

const historyTypes = [...TYPE_OPTIONS, { value: "speaking" as const, label: "Nói (AI chấm)" }];
const statusOptions = [
  { value: "graded", label: "Đã chấm" },
  { value: "pending", label: "Chờ chấm" },
] as const;

const filterFields = [
  { name: "skill", label: "Kỹ năng", options: SKILL_OPTIONS },
  { name: "level", label: "Cấp độ", options: LEVEL_OPTIONS.map((level) => ({ value: level, label: level })) },
  { name: "type", label: "Dạng bài", options: historyTypes },
  { name: "status", label: "Trạng thái chấm", options: statusOptions },
] as const;

export default function PracticeHistoryPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get("page"));
  const filters: PracticeHistoryFilters = {
    page: Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 100000 ? rawPage : 1,
    skill: SKILL_OPTIONS.find((option) => option.value === params.get("skill"))?.value,
    level: LEVEL_OPTIONS.find((level) => level === params.get("level")),
    type: historyTypes.find((option) => option.value === params.get("type"))?.value,
    status: statusOptions.find((option) => option.value === params.get("status"))?.value,
  };
  const history = useQuery({
    queryKey: [...PRACTICE_HISTORY_KEY, filters],
    queryFn: ({ signal }) => listPracticeHistory(filters, signal),
    refetchOnMount: "always",
    retry: false,
  });

  const page = filters.page;
  const total = history.data?.total;
  const pageCount = history.data ? Math.max(1, Math.ceil(history.data.total / history.data.pageSize)) : undefined;
  const filtered = filterFields.some(({ name }) => filters[name] !== undefined);

  useEffect(() => {
    if (pageCount === undefined || page <= pageCount) return;
    const next = new URLSearchParams(params);
    if (pageCount > 1) next.set("page", String(pageCount));
    else next.delete("page");
    setParams(next, { replace: true });
  }, [page, pageCount, params, setParams]);

  function changeFilter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setParams(next);
  }

  function changePage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-5 lg:px-8">
      <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
        Lịch sử làm bài
      </h1>

      <fieldset className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <legend className="px-2 text-sm font-bold text-slate-900">Bộ lọc</legend>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 xl:grid-cols-4">
          {filterFields.map(({ name, label, options }) => (
            <div key={name} className="min-w-0">
              <label htmlFor={`history-${name}`} className="text-sm font-semibold text-slate-700">
                {label}
              </label>
              <select
                id={`history-${name}`}
                value={filters[name] ?? ""}
                onChange={(event) => changeFilter(name, event.target.value)}
                className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
              >
                <option value="">Tất cả</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {filtered && (
          <button type="button" onClick={() => setParams({})} className="mt-3 rounded text-sm font-bold text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
            Xóa bộ lọc
          </button>
        )}
      </fieldset>

      {history.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tải được lịch sử làm bài.
          <Button variant="outline" size="sm" onClick={() => history.refetch()}>Thử lại</Button>
        </div>
      ) : history.isPending || (pageCount !== undefined && page > pageCount) ? (
        <p role="status" className="mt-6 text-sm text-slate-500">Đang tải lịch sử…</p>
      ) : !history.data?.items.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="font-semibold text-slate-900">
            {filtered ? "Không có lượt nộp khớp bộ lọc." : "Em chưa nộp bài trong Thư viện luyện tập."}
          </p>
          {!filtered && <Button className="mt-4" to="/student/library">Đến thư viện luyện tập</Button>}
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm font-semibold text-slate-600" aria-live="polite">{total} lượt nộp</p>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {history.data.items.map(({ id, exercise, score, maxScore, submittedAt }) => (
              <li key={id}>
                <Link
                  to={{ pathname: `/student/history/${id}`, search: params.toString() }}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-4 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-5"
                >
                  <div className="min-w-0 flex-1 basis-full sm:basis-0">
                    <p className="break-words font-bold text-slate-900">{exercise.topic}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {SKILL_OPTIONS.find((option) => option.value === exercise.skill)?.label} · {exercise.level} · {historyTypes.find((option) => option.value === exercise.type)?.label ?? exercise.type}
                    </p>
                  </div>
                  <div className="grow text-sm sm:grow-0 sm:text-right">
                    <p className={score === null ? "font-semibold text-amber-700" : "font-bold text-brand"}>
                      {score === null ? "Chờ chấm" : `${formatScore(score)}/${formatScore(maxScore)}`}
                    </p>
                    <p className="mt-1 text-slate-600">
                      Nộp lúc <time dateTime={submittedAt}>{formatPracticeSubmissionTime(submittedAt)}</time>
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageCount={pageCount ?? 1} onChange={changePage} />
        </>
      )}
    </div>
  );
}