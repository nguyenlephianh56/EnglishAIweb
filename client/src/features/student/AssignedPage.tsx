import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, CircleCheck, ClipboardCheck, School, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import JoinClassModal from "./JoinClassModal";
import AssignedCard from "./AssignedCard";
import { useStudentClasses, STUDENT_CLASSES_KEY } from "../account/useAccountClasses";
import { ASSIGNMENTS_KEY, ASSIGNMENTS_PAGE_SIZE, useAssignmentCounts, useAssignmentList } from "./useAssignments";
import { parseAssignmentFilters } from "./assignmentFilters";
import { ASSIGNMENT_TABS } from "./assignmentTime";
import { HOME_KEY } from "./useHomeData";
import { formatNumber } from "../../utils/format";
import type { JoinedClass } from "../../types/student";

const EMPTY_TEXT = {
  all: { title: "Bạn chưa có bài nào được giao", hint: "Khi giáo viên giao bài, các bài sẽ hiện ở đây." },
  NOT_STARTED: { title: "Bạn chưa có bài nào cần làm", hint: "Bạn đã làm hết các bài được giao. Làm tốt lắm!" },
  SUBMITTED: { title: "Bạn chưa nộp bài nào", hint: "Các bài bạn đã làm sẽ hiện ở đây cùng điểm cao nhất." },
  OVERDUE: { title: "Không có bài nào quá hạn", hint: "Bạn đang theo kịp tiến độ, hãy giữ vững nhé." },
} as const;

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

export default function AssignedPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const filters = parseAssignmentFilters(params);

  const classes = useStudentClasses();
  const list = useAssignmentList(filters);
  const { counts, refetch: refetchCounts } = useAssignmentCounts(filters.classId);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinedName, setJoinedName] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!joinedName) return;
    const t = window.setTimeout(() => setJoinedName(null), 6000);
    return () => window.clearTimeout(t);
  }, [joinedName]);

  // Đổi bộ lọc thì về trang 1; đồng bộ lên URL
  function update(patch: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace });
  }

  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ASSIGNMENTS_PAGE_SIZE));

  // Trang hiện tại vượt quá số trang (ví dụ dữ liệu vừa giảm): lùi về trang cuối
  useEffect(() => {
    if (list.data && !list.isPlaceholderData && list.data.items.length === 0 && list.data.total > 0 && filters.page > 1) {
      update({ page: pageCount > 1 ? String(pageCount) : undefined }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, list.isPlaceholderData]);

  function handleJoined(joined: JoinedClass) {
    setJoinOpen(false);
    setJoinedName(joined.name);
    queryClient.invalidateQueries({ queryKey: STUDENT_CLASSES_KEY });
    queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
    queryClient.invalidateQueries({ queryKey: HOME_KEY });
  }

  const selectedTab = filters.status ?? "all";
  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = ASSIGNMENT_TABS.findIndex((t) => t.id === selectedTab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % ASSIGNMENT_TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + ASSIGNMENT_TABS.length) % ASSIGNMENT_TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ASSIGNMENT_TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    update({ status: ASSIGNMENT_TABS[next].status });
    tabRefs.current[ASSIGNMENT_TABS[next].id]?.focus();
  }

  const joinedClasses = classes.data ?? [];
  const noClasses = classes.isSuccess && joinedClasses.length === 0;
  const showClassFilter = classes.isSuccess && joinedClasses.length > 0; // lỗi tải lớp thì ẩn bộ lọc
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Bài được giao</h1>
      <p className="mt-2 text-slate-500">Hoàn thành đúng hạn để không bỏ lỡ tiến độ.</p>

      {joinedName && (
        <div role="status" className="mt-6 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          Bạn đã tham gia lớp “{joinedName}” thành công.
        </div>
      )}

      {noClasses ? (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <School className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Bạn chưa tham gia lớp nào</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Nhập mã lớp do giáo viên cung cấp để nhận bài được giao.</p>
          <div className="mt-5">
            <Button rightIcon={<Users />} onClick={() => setJoinOpen(true)}>
              Tham gia lớp
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <div role="tablist" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
              {ASSIGNMENT_TABS.map((t) => {
                const selected = t.id === selectedTab;
                const count = counts[t.id];
                return (
                  <button
                    key={t.id}
                    ref={(el) => {
                      tabRefs.current[t.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`assigned-tab-${t.id}`}
                    aria-selected={selected}
                    aria-controls="assigned-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => update({ status: t.status })}
                    onKeyDown={onTabKeyDown}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                      selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t.label}
                    <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>
                      {count === undefined ? "…" : formatNumber(count)}
                    </span>
                  </button>
                );
              })}
            </div>

            {showClassFilter && (
              <div className="relative">
                <label htmlFor="assigned-class" className="sr-only">
                  Lọc theo lớp
                </label>
                <select
                  id="assigned-class"
                  value={filters.classId ? String(filters.classId) : "all"}
                  onChange={(e) => update({ classId: e.target.value === "all" ? undefined : e.target.value })}
                  className="h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
                >
                  <option value="all">Tất cả lớp</option>
                  {joinedClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              </div>
            )}
          </div>

          <div role="tabpanel" id="assigned-panel" aria-labelledby={`assigned-tab-${selectedTab}`} className="mt-6">
            {list.isError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                <span className="flex items-center gap-2">
                  <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
                  Không tải được danh sách bài được giao.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    list.refetch();
                    refetchCounts();
                  }}
                >
                  Thử lại
                </Button>
              </div>
            ) : list.isLoading ? (
              <div className="grid gap-5 md:grid-cols-2" role="status" aria-label="Đang tải">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-56" />
                ))}
              </div>
            ) : (list.data?.items.length ?? 0) === 0 && (list.data?.total ?? 0) === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                  <ClipboardCheck className="size-6" />
                </span>
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">{EMPTY_TEXT[selectedTab].title}</p>
                <p className="mt-1 text-sm text-slate-500">{filters.classId ? "Không có bài phù hợp trong lớp đã chọn." : EMPTY_TEXT[selectedTab].hint}</p>
                {filters.classId && (
                  <div className="mt-5">
                    <Button variant="outline" onClick={() => update({ classId: undefined })}>
                      Xem tất cả lớp
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={`grid gap-5 transition-opacity md:grid-cols-2 ${list.isFetching ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
                  {list.data?.items.map((item) => (
                    <AssignedCard key={item.assignmentId} item={item} now={now} />
                  ))}
                </div>
                <Pagination page={filters.page} pageCount={pageCount} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
              </>
            )}
          </div>
        </>
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
    </div>
  );
}
