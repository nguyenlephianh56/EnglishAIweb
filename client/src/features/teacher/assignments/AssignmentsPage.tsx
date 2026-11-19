import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, ChevronDown, CircleAlert, ClipboardList } from "lucide-react";
import Button from "../../../components/ui/Button";
import Pagination from "../../../components/ui/Pagination";
import Notice from "../../account/Notice";
import { useTeacherClasses } from "../useTeacherData";
import { useAllTeacherAssignments } from "./useTeacherAssignments";
import { computeStats, phaseOf } from "./assignmentMeta";
import AssignmentsTable from "./AssignmentsTable";
import { formatNumber } from "../../../utils/format";

type Tab = "ongoing" | "ended";

// Không có tab "Bản nháp": backend không có bản nháp cho bài giao
const TABS: { id: Tab; label: string }[] = [
  { id: "ongoing", label: "Đang diễn ra" },
  { id: "ended", label: "Đã kết thúc" },
];

const PAGE_SIZE = 10;

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="flex items-baseline gap-2 px-6 py-5 first:pl-8">
      <span className="font-heading text-3xl font-extrabold text-slate-900">{value === undefined ? "…" : formatNumber(value)}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

/** /teacher/assignments: thống kê, tab Đang diễn ra / Đã kết thúc, lọc theo lớp, bảng bài đã giao. */
export default function AssignmentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "ended" ? "ended" : "ongoing";
  const classIdParam = Number.parseInt(params.get("classId") ?? "", 10);
  const classId = Number.isFinite(classIdParam) && classIdParam > 0 ? classIdParam : undefined;
  const pageParam = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const classes = useTeacherClasses();
  const all = useAllTeacherAssignments(classId);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Thông báo thành công từ trang Giao bài (truyền qua location.state), đọc một lần rồi xóa khỏi lịch sử
  const [notice, setNotice] = useState<string>();
  useEffect(() => {
    const state = location.state as { notice?: string } | null;
    if (state?.notice) {
      setNotice(state.notice);
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page"); // đổi tab/lớp thì về trang 1
    setParams(next);
  }

  const now = new Date();
  const items = all.data?.items ?? [];
  // Thống kê và tab cùng tính trên dữ liệu thật đã lọc theo lớp
  const stats = all.data ? computeStats(items, now) : undefined;
  const inTab = items
    .filter((a) => (phaseOf(a.dueAt, now) === "ENDED") === (tab === "ended"))
    .sort((a, b) => (tab === "ongoing" ? new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime() : new Date(b.dueAt).getTime() - new Date(a.dueAt).getTime()));
  const pageCount = Math.max(1, Math.ceil(inTab.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = inTab.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    update({ tab: TABS[next].id === "ongoing" ? undefined : "ended" });
    tabRefs.current[TABS[next].id]?.focus();
  }

  const teacherClasses = classes.data ?? [];
  const showClassFilter = classes.isSuccess && teacherClasses.length > 0;
  const emptyTab = !all.isLoading && !all.isError && inTab.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Bài đã giao</h1>
          <p className="mt-2 text-slate-500">Giao bài và theo dõi tiến độ từng lớp.</p>
        </div>
        <Button to="/teacher/assignments/new" size="lg" rightIcon={<BookOpen />}>
          Giao bài tập
        </Button>
      </div>

      {notice && (
        <div className="mt-6">
          <Notice type="success">{notice}</Notice>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 divide-y divide-slate-100 rounded-3xl border border-slate-200 bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Thống kê bài đã giao">
        <Stat value={stats?.ongoing} label="Đang diễn ra" />
        <Stat value={stats?.dueSoon} label="Sắp đến hạn" />
        <Stat value={stats?.ended} label="Đã kết thúc" />
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="tablist" aria-label="Lọc bài đã giao" className="flex flex-wrap gap-2">
            {TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`teacher-assign-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls="teacher-assign-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => update({ tab: t.id === "ongoing" ? undefined : "ended" })}
                  onKeyDown={onTabKeyDown}
                  className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                    selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {showClassFilter && (
            <div className="relative">
              <label htmlFor="teacher-assign-class" className="sr-only">
                Lọc theo lớp
              </label>
              <select
                id="teacher-assign-class"
                value={classId ? String(classId) : "all"}
                onChange={(e) => update({ classId: e.target.value === "all" ? undefined : e.target.value })}
                className="h-11 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
              >
                <option value="all">Tất cả lớp</option>
                {teacherClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            </div>
          )}
        </div>

        <div role="tabpanel" id="teacher-assign-panel" aria-labelledby={`teacher-assign-tab-${tab}`} className="mt-5">
          {all.isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <span className="flex items-center gap-2">
                <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
                Không tải được danh sách bài đã giao.
              </span>
              <Button variant="outline" size="sm" onClick={() => all.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : all.isLoading ? (
            <div className="space-y-3" role="status" aria-label="Đang tải">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-200" aria-hidden="true" />
              ))}
            </div>
          ) : emptyTab ? (
            <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                <ClipboardList className="size-6" />
              </span>
              <p className="mt-3 font-heading text-lg font-bold text-slate-900">
                {classId ? "Lớp này chưa có bài trong mục này" : tab === "ongoing" ? "Chưa có bài nào đang diễn ra" : "Chưa có bài nào đã kết thúc"}
              </p>
              <p className="mt-1 text-sm text-slate-500">{tab === "ongoing" ? "Giao bài cho lớp để học sinh bắt đầu làm." : "Bài sẽ chuyển vào đây khi quá hạn nộp."}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                {classId && (
                  <Button variant="outline" onClick={() => update({ classId: undefined })}>
                    Xem tất cả lớp
                  </Button>
                )}
                <Button to={classId ? `/teacher/assignments/new?classId=${classId}` : "/teacher/assignments/new"} rightIcon={<BookOpen />}>
                  Giao bài tập
                </Button>
              </div>
            </div>
          ) : (
            <>
              {all.data?.truncated && (
                <p className="mb-3 text-xs font-semibold text-amber-700">Chỉ tải được {formatNumber(items.length)} trên tổng số {formatNumber(all.data.total)} bài giao nên thống kê có thể chưa đầy đủ.</p>
              )}
              <AssignmentsTable items={visible} now={now} />
              <Pagination page={currentPage} pageCount={pageCount} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
