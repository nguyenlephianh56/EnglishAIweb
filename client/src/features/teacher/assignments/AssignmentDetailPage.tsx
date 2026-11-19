import { useRef } from "react";
import type { KeyboardEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CircleAlert, SearchX, Users } from "lucide-react";
import Button from "../../../components/ui/Button";
import { UserAvatar } from "../../../components/layout/AppLayout";
import { getErrorMessage } from "../../../api/client";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { formatScore } from "../../student/assignmentTime";
import { formatNumber, formatRegisteredAt } from "../../../utils/format";
import { PHASE_BADGE, SUBMISSION_STATUS_BADGE, formatDueFull, phaseOf, typeLabel } from "./assignmentMeta";
import { useAssignmentSubmissions } from "./useTeacherAssignments";
import type { AssignmentStatus, SubmissionItem } from "../../../types/assignments";

type Filter = "all" | AssignmentStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "NOT_STARTED", label: "Chưa làm" },
  { id: "SUBMITTED", label: "Đã nộp" },
  { id: "OVERDUE", label: "Quá hạn" },
];

const TH = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400";

function BackLink() {
  return (
    <Link
      to="/teacher/assignments"
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Bài đã giao
    </Link>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** Điểm cao nhất; đã nộp mà chưa có điểm (ví dụ bài Viết chờ chấm) thì ghi "Chờ chấm" */
function scoreCell(s: SubmissionItem) {
  if (s.bestScore !== null) return <span className="font-bold text-slate-900">{formatScore(s.bestScore)}</span>;
  return s.attemptsUsed > 0 ? <span className="text-xs font-semibold text-slate-500">Chờ chấm</span> : <span className="text-slate-400">—</span>;
}

/** /teacher/assignments/:assignmentId: bài nộp của cả lớp (GET /assignments/:id/submissions). */
export default function AssignmentDetailPage() {
  const params = useParams();
  const id = Number(params.assignmentId);
  const [search, setSearch] = useSearchParams();
  const { data, isLoading, isError, error, refetch } = useAssignmentSubmissions(id);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const idValid = Number.isInteger(id) && id > 0;
  const notFound = !idValid || (isError && axios.isAxiosError(error) && error.response?.status === 404);

  const raw = search.get("status");
  const filter: Filter = FILTERS.find((f) => f.id === raw)?.id ?? "all";
  function setFilter(next: Filter) {
    const p = new URLSearchParams(search);
    if (next === "all") p.delete("status");
    else p.set("status", next);
    setSearch(p, { replace: true });
  }

  const items = data?.items ?? [];
  const counts: Record<Filter, number> = {
    all: items.length,
    NOT_STARTED: items.filter((s) => s.status === "NOT_STARTED").length,
    SUBMITTED: items.filter((s) => s.status === "SUBMITTED").length,
    OVERDUE: items.filter((s) => s.status === "OVERDUE").length,
  };
  const visible = filter === "all" ? items : items.filter((s) => s.status === filter);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = FILTERS.findIndex((f) => f.id === filter);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % FILTERS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + FILTERS.length) % FILTERS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = FILTERS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setFilter(FILTERS[next].id);
    tabRefs.current[FILTERS[next].id]?.focus();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <BackLink />

      {notFound ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <SearchX className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không tìm thấy bài giao</p>
          <p className="mt-1 text-sm text-slate-500">Bài giao không tồn tại hoặc không thuộc lớp của thầy/cô.</p>
          <div className="mt-5">
            <Button to="/teacher/assignments" variant="outline">
              Về danh sách bài đã giao
            </Button>
          </div>
        </div>
      ) : isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            {getErrorMessage(error, "Không tải được bài nộp của lớp.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      ) : isLoading || !data ? (
        <div className="mt-6 space-y-5" role="status" aria-label="Đang tải" aria-busy="true">
          <Skeleton className="h-32" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          {(() => {
            const a = data.assignment;
            const skill = ANY_SKILL_META[a.exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
            const phase = PHASE_BADGE[phaseOf(a.dueAt)];
            return (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`size-3.5 shrink-0 rounded-full ${skill.bar}`} aria-hidden="true" />
                  <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{a.exercise.topic}</h1>
                  <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${phase.className}`}>{phase.label}</span>
                </div>
                <p className="mt-2 text-slate-500">
                  {a.class.name} • {skill.label} • {typeLabel(a.exercise.type)} • {a.exercise.level} • Hạn nộp {formatDueFull(a.dueAt)}
                </p>
                <p className="mt-3 text-sm font-semibold text-slate-700">
                  Đã nộp {formatNumber(data.submittedCount)}/{formatNumber(data.totalStudents)} học sinh • Mỗi học sinh làm tối đa {a.maxAttempts} lần
                </p>
              </div>
            );
          })()}

          <section aria-labelledby="submissions-heading" className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="submissions-heading" className="sr-only">
              Danh sách học sinh
            </h2>
            <div role="tablist" aria-label="Lọc theo trạng thái" className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const selected = f.id === filter;
                return (
                  <button
                    key={f.id}
                    ref={(el) => {
                      tabRefs.current[f.id] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`sub-tab-${f.id}`}
                    aria-selected={selected}
                    aria-controls="sub-panel"
                    tabIndex={selected ? 0 : -1}
                    onClick={() => setFilter(f.id)}
                    onKeyDown={onTabKeyDown}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                      selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {f.label}
                    <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>{formatNumber(counts[f.id])}</span>
                  </button>
                );
              })}
            </div>

            <div role="tabpanel" id="sub-panel" aria-labelledby={`sub-tab-${filter}`} className="mt-5">
              {items.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-300 p-12 text-center">
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                    <Users className="size-6" />
                  </span>
                  <p className="mt-3 font-heading text-lg font-bold text-slate-900">Lớp chưa có học sinh</p>
                  <p className="mt-1 text-sm text-slate-500">Thêm học sinh vào lớp để họ nhận được bài này.</p>
                  <div className="mt-5">
                    <Button to={`/teacher/classes/${data.assignment.class.id}`} variant="outline">
                      Mở lớp
                    </Button>
                  </div>
                </div>
              ) : visible.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Không có học sinh nào ở trạng thái này.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-left text-sm">
                    <caption className="sr-only">Bài nộp của học sinh trong lớp</caption>
                    <thead className="bg-slate-50">
                      <tr>
                        <th scope="col" className={TH}>Học sinh</th>
                        <th scope="col" className={TH}>Trạng thái</th>
                        <th scope="col" className={TH}>Số lần làm</th>
                        <th scope="col" className={TH}>Điểm cao nhất</th>
                        <th scope="col" className={TH}>Nộp gần nhất</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {visible.map((s) => {
                        const badge = SUBMISSION_STATUS_BADGE[s.status];
                        return (
                          <tr key={s.studentId}>
                            <td className="px-4 py-3">
                              <span className="flex items-center gap-3">
                                <UserAvatar name={s.name} />
                                <span className="min-w-0">
                                  <span className="block font-bold text-slate-900">{s.name}</span>
                                  <span className="block truncate text-xs text-slate-500">{s.email}</span>
                                </span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="flex flex-wrap gap-1.5">
                                <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${badge.className}`}>{badge.label}</span>
                                {s.lateSubmission && <span className="whitespace-nowrap rounded-full bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700">Nộp trễ</span>}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {s.attemptsUsed}/{data.assignment.maxAttempts}
                            </td>
                            <td className="px-4 py-3">{scoreCell(s)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{s.lastSubmittedAt ? formatRegisteredAt(s.lastSubmittedAt) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
