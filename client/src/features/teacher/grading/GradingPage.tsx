import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, ClipboardCheck } from "lucide-react";
import Button from "../../../components/ui/Button";
import { UserAvatar } from "../../../components/layout/AppLayout";
import { formatNumber } from "../../../utils/format";
import { formatDateTime } from "./gradingMeta";
import { useGradingList } from "./useGrading";
import type { GradingListItem, GradingStatus } from "../../../types/grading";

const TABS: { id: GradingStatus; label: string }[] = [
  { id: "PENDING", label: "Chờ chấm" },
  { id: "GRADED", label: "Đã chấm" },
];

const STATUS_BADGE: Record<GradingStatus, { label: string; className: string }> = {
  PENDING: { label: "Chờ chấm", className: "bg-amber-50 text-amber-700" },
  GRADED: { label: "Đã chấm", className: "bg-green-50 text-green-700" },
};

const th = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400";

/** /teacher/grading: danh sách "Bài cần chấm". Dữ liệu GIẢ (xem features/teacher/mock/gradingData.ts). */
export default function GradingPage() {
  const { data, isLoading, isError, refetch } = useGradingList();
  const [tab, setTab] = useState<GradingStatus>("PENDING");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const all: GradingListItem[] = data ?? [];
  const visible = all.filter((s) => s.status === tab);
  const count = (s: GradingStatus) => all.filter((x) => x.status === s).length;

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Bài cần chấm</h1>
      <p className="mt-2 text-slate-500">Xem điểm AI gợi ý, chỉnh điểm và gửi nhận xét cho học sinh.</p>
      <p className="mt-3 inline-block rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">Đang dùng dữ liệu minh họa: backend chưa có API chấm bài cho giáo viên.</p>

      <div role="tablist" aria-label="Trạng thái chấm bài" className="mt-6 flex flex-wrap gap-2">
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
              id={`grading-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="grading-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKeyDown}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
              <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>{isLoading ? "…" : formatNumber(count(t.id))}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="grading-panel" aria-labelledby={`grading-tab-${tab}`} className="mt-4">
        {isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách bài cần chấm.
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3" role="status" aria-label="Đang tải">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <ClipboardCheck className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">{tab === "PENDING" ? "Không còn bài nào cần chấm" : "Chưa có bài nào được chấm"}</p>
            <p className="mt-1 text-sm text-slate-500">{tab === "PENDING" ? "Bài viết mới của học sinh sẽ hiện ở đây." : "Bài thầy/cô đã chấm sẽ hiện ở đây."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <caption className="sr-only">Danh sách bài viết cần chấm</caption>
              <thead>
                <tr className="border-b border-slate-100">
                  <th scope="col" className={th}>Học sinh</th>
                  <th scope="col" className={th}>Bài</th>
                  <th scope="col" className={th}>Lớp</th>
                  <th scope="col" className={th}>Nộp lúc</th>
                  <th scope="col" className={th}>Trạng thái</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-3">
                        <UserAvatar name={s.studentName} />
                        <span className="font-bold text-slate-900">{s.studentName}</span>
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-slate-700" title={s.exerciseTitle}>{s.exerciseTitle}</td>
                    <td className="px-4 py-3 text-slate-700">{s.className}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(s.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[s.status].className}`}>{STATUS_BADGE[s.status].label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/teacher/grading/${s.id}`}
                        className="inline-flex h-10 items-center rounded-xl px-4 text-xs font-bold text-brand hover:bg-brand-light focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                      >
                        {s.status === "PENDING" ? "Chấm bài" : "Xem lại"}
                        <span className="sr-only"> của {s.studentName}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
