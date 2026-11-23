import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleAlert, Search } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Pagination from "../../../components/ui/Pagination";
import { listExercises } from "../../../api/exercises";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { typeLabel } from "./assignmentMeta";
import type { ExerciseListItem } from "../../../types/exercise";

const PICKER_PAGE_SIZE = 6;

const STATUS_NOTE: Record<string, string> = { DRAFT: "Bản nháp", PROPOSED: "Đang chờ duyệt" };

interface ExercisePickerProps {
  value: ExerciseListItem | null;
  onChange: (exercise: ExerciseListItem) => void;
  error?: string;
}

/**
 * Chọn bài tập để giao: danh sách THẬT từ GET /exercises (bài của giáo viên + bài thư viện), có tìm theo chủ đề.
 * Không hiện bài đã ẩn (HIDDEN). Dạng Nói giao được (backend đã nhận).
 */
export default function ExercisePicker({ value, onChange, error }: ExercisePickerProps) {
  const [text, setText] = useState("");
  const [page, setPage] = useState(1);
  const topic = useDebouncedValue(text.trim(), 300);

  useEffect(() => setPage(1), [topic]);

  const query = useQuery({
    queryKey: ["teacher", "exercise-picker", topic, page] as const,
    queryFn: () => listExercises({ topic: topic || undefined, page, pageSize: PICKER_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

  const items = (query.data?.items ?? []).filter((e) => e.status !== "HIDDEN");
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? 0) / PICKER_PAGE_SIZE));

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 block text-sm font-bold text-slate-900">Bài tập</legend>
      <Input label="Tìm bài tập theo chủ đề" hideLabel leftIcon={<Search />} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm theo chủ đề, ví dụ: Daily life" autoComplete="off" />

      {value && (
        <p className="mt-2 text-sm text-slate-600">
          Đã chọn: <strong className="text-slate-900">{value.topic}</strong> ({typeLabel(value.type)}, {value.level})
        </p>
      )}

      <div className="mt-3">
        {query.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách bài tập.
            </span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : query.isLoading ? (
          <div className="space-y-2" role="status" aria-label="Đang tải">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">{topic ? "Không có bài nào khớp chủ đề này." : "Chưa có bài tập nào có thể giao."}</p>
        ) : (
          <div role="radiogroup" aria-label="Danh sách bài tập" className={`space-y-2 transition-opacity ${query.isFetching ? "opacity-60" : ""}`}>
            {items.map((e) => {
              const skill = ANY_SKILL_META[e.skill] ?? ANY_SKILL_META.FOUNDATION;
              const selected = value?.id === e.id;
              const note = e.status ? STATUS_NOTE[e.status] : undefined;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(e)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                    selected ? "border-brand bg-brand-light/60" : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className={`size-3 shrink-0 rounded-full ${skill.bar}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-slate-900">{e.topic}</span>
                    <span className="block text-xs text-slate-500">
                      {skill.label} • {typeLabel(e.type)} • {e.level}
                    </span>
                  </span>
                  {note && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{note}</span>}
                </button>
              );
            })}
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} onChange={setPage} />
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </fieldset>
  );
}
