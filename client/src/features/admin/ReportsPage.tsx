import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCheck, CircleAlert, Flag, Loader2, Play, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { formatDate, formatTime } from "../../utils/format";
import { typeLabel } from "../teacher/assignments/assignmentMeta";
import { formatRelativeTime } from "../shared/notifications/notificationMeta";
import { SkillBadge, StatusBadge } from "./ExerciseBadges";
import { REPORT_STATUSES, REPORT_STATUS_BADGE, REPORT_STATUS_LABEL } from "./adminMeta";
import { useReportList, useUpdateReport } from "./useReports";
import type { ReportItem, ReportStatus } from "../../types/report";

type TabId = ReportStatus | "all";
type Flash = { type: "success" | "error"; text: string };

const TABS: { id: TabId; label: string }[] = [
  { id: "OPEN", label: "Đang mở" },
  { id: "IN_PROGRESS", label: "Đang xử lý" },
  { id: "RESOLVED", label: "Đã xử lý" },
  { id: "all", label: "Tất cả" },
];

const LONG_REASON = 180;

const absolute = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${formatTime(d)}, ${formatDate(d)}`;
};

function ReportCard({ report, busy, onStart, onResolve }: { report: ReportItem; busy: boolean; onStart: (r: ReportItem) => void; onResolve: (r: ReportItem) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { exercise: ex } = report;
  const long = report.reason.length > LONG_REASON || report.reason.split("\n").length > 3;

  return (
    <article className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-bold text-slate-900">{ex.topic}</h3>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <SkillBadge skill={ex.skill} />
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{ex.level}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{typeLabel(ex.type)}</span>
            <StatusBadge status={ex.status} />
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${REPORT_STATUS_BADGE[report.status]}`}>{REPORT_STATUS_LABEL[report.status]}</span>
      </div>

      <div className="mt-4 rounded-2xl bg-slate-50 p-4">
        <p className={`whitespace-pre-line break-words text-sm leading-6 text-slate-700 ${expanded ? "" : "line-clamp-3"}`}>{report.reason}</p>
        {long && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 rounded text-xs font-bold text-brand hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
          >
            {expanded ? "Thu gọn" : "Xem thêm"}
          </button>
        )}
      </div>

      <p className="mt-3 text-sm text-slate-500">
        <span className="font-semibold text-slate-700">{report.reporter.name}</span> báo lỗi • {formatRelativeTime(report.created_at)} <span className="text-slate-400">({absolute(report.created_at)})</span>
      </p>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
        <Button to={`/admin/library/${ex.id}`} variant="ghost" size="sm">
          Xem bài
        </Button>
        {report.status === "OPEN" && (
          <Button variant="outline" size="sm" leftIcon={<Play />} disabled={busy} onClick={() => onStart(report)}>
            Bắt đầu xử lý
          </Button>
        )}
        {report.status !== "RESOLVED" && (
          <Button size="sm" leftIcon={<CheckCheck />} disabled={busy} onClick={() => onResolve(report)}>
            Đánh dấu đã xử lý
          </Button>
        )}
      </div>
    </article>
  );
}

/** /admin/reports: báo lỗi bài tập do học sinh gửi, xử lý theo OPEN → IN_PROGRESS → RESOLVED. */
export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const tab: TabId = rawStatus === "all" ? "all" : (REPORT_STATUSES.find((s) => s === rawStatus) ?? "OPEN");
  const parsedExercise = Number.parseInt(params.get("exercise_id") ?? "", 10);
  const exerciseId = Number.isFinite(parsedExercise) && parsedExercise > 0 ? parsedExercise : undefined;

  const list = useReportList(tab === "all" ? undefined : tab, exerciseId);
  const update = useUpdateReport();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [toResolve, setToResolve] = useState<ReportItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  useEffect(() => {
    if (flash?.type !== "success") return;
    const t = window.setTimeout(() => setFlash(null), 6000);
    return () => window.clearTimeout(t);
  }, [flash]);

  function setParam(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setParam({ status: TABS[next].id === "OPEN" ? undefined : TABS[next].id });
    tabRefs.current[TABS[next].id]?.focus();
  }

  async function run(report: ReportItem, status: "IN_PROGRESS" | "RESOLVED") {
    setFlash(null);
    setBusyId(report.id);
    try {
      await update.mutateAsync({ id: report.id, status });
      setFlash({ type: "success", text: status === "IN_PROGRESS" ? `Đã chuyển báo lỗi bài “${report.exercise.topic}” sang đang xử lý.` : `Đã đánh dấu báo lỗi bài “${report.exercise.topic}” là đã xử lý.` });
    } catch (err) {
      // 409 INVALID_STATUS_TRANSITION (báo lỗi đã đổi ở nơi khác): danh sách đã được tải lại, hiện thông báo của máy chủ
      setFlash({ type: "error", text: getErrorMessage(err, "Không cập nhật được báo lỗi, vui lòng thử lại.") });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmResolve() {
    if (!toResolve) return;
    const target = toResolve;
    setToResolve(null);
    await run(target, "RESOLVED");
  }

  const emptyText: Record<TabId, string> = {
    OPEN: "Không có báo lỗi nào đang mở.",
    IN_PROGRESS: "Không có báo lỗi nào đang xử lý.",
    RESOLVED: "Chưa có báo lỗi nào được xử lý.",
    all: "Chưa có báo lỗi nào.",
  };

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Báo lỗi</h1>
      <p className="mt-2 text-slate-500">Các bài tập học sinh báo có lỗi. Bắt đầu xử lý, sửa bài trong thư viện rồi đánh dấu đã xử lý.</p>

      <div role="tablist" aria-label="Lọc báo lỗi theo trạng thái" className="mt-6 flex flex-wrap gap-2">
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
              id={`report-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="report-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setParam({ status: t.id === "OPEN" ? undefined : t.id })}
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

      {exerciseId !== undefined && (
        <p className="mt-3">
          <button
            type="button"
            onClick={() => setParam({ exercise_id: undefined })}
            aria-label="Bỏ lọc theo bài tập"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
          >
            Chỉ bài #{exerciseId}
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </p>
      )}

      {flash && (
        <div className="mt-4">
          <Notice type={flash.type}>{flash.text}</Notice>
        </div>
      )}

      <div role="tabpanel" id="report-panel" aria-labelledby={`report-tab-${tab}`} className="mt-5">
        {list.isError && !list.data ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách báo lỗi.
            </span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : list.isLoading ? (
          <div className="space-y-4" role="status" aria-label="Đang tải">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 animate-pulse rounded-3xl bg-slate-200" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <Flag className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">{emptyText[tab]}</p>
          </div>
        ) : (
          <div className={`space-y-4 transition-opacity ${list.isFetching && !list.isFetchingNextPage ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
            {items.map((r) => (
              <ReportCard key={r.id} report={r} busy={busyId === r.id} onStart={(x) => void run(x, "IN_PROGRESS")} onResolve={setToResolve} />
            ))}

            {list.isFetchNextPageError && <Notice type="error">Không tải thêm được báo lỗi, vui lòng thử lại.</Notice>}
            {list.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button variant="outline" disabled={list.isFetchingNextPage} leftIcon={list.isFetchingNextPage ? <Loader2 className="animate-spin" /> : undefined} onClick={() => void list.fetchNextPage()}>
                  Tải thêm
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={toResolve !== null} onClose={() => setToResolve(null)} title="Đánh dấu đã xử lý?" description={toResolve ? `Báo lỗi bài “${toResolve.exercise.topic}” sẽ chuyển sang “Đã xử lý”.` : undefined}>
        <p className="text-sm text-slate-600">Hãy chắc chắn bài đã được sửa hoặc không cần sửa. Báo lỗi đã xử lý không chuyển ngược lại được.</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setToResolve(null)}>
            Hủy
          </Button>
          <Button leftIcon={<CheckCheck />} onClick={() => void confirmResolve()}>
            Đã xử lý
          </Button>
        </div>
      </Modal>
    </div>
  );
}
