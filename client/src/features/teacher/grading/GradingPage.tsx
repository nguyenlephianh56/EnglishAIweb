import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { CircleAlert, ClipboardCheck } from "lucide-react";
import Button from "../../../components/ui/Button";
import { getErrorMessage } from "../../../api/client";
import { formatNumber } from "../../../utils/format";
import SubmissionsTable from "../assignments/SubmissionsTable";
import { formatDueFull, typeLabel } from "../assignments/assignmentMeta";
import { useAllTeacherAssignments, useAssignmentSubmissions } from "../assignments/useTeacherAssignments";

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
        <ClipboardCheck className="size-6" />
      </span>
      <p className="mt-3 font-heading text-lg font-bold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
        {message}
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

const Skeleton = ({ className }: { className: string }) => <div className={`animate-pulse rounded-2xl bg-slate-100 ${className}`} aria-hidden="true" />;

/** /teacher/grading: chọn một bài giao, xem bài nộp của lớp và vào chấm từng bài (GET /assignments và /assignments/:id/submissions). */
export default function GradingPage() {
  const [search, setSearch] = useSearchParams();
  const assignments = useAllTeacherAssignments();
  const list = assignments.data?.items ?? [];

  // Bài đang chọn: theo ?assignmentId=, không hợp lệ thì bài đầu danh sách (hạn nộp xa nhất)
  const wanted = Number(search.get("assignmentId"));
  const selected = list.find((a) => a.assignmentId === wanted) ?? list[0];
  const selectedId = selected?.assignmentId ?? 0;
  const subs = useAssignmentSubmissions(selectedId);

  function choose(id: number) {
    const p = new URLSearchParams(search);
    p.set("assignmentId", String(id));
    setSearch(p, { replace: true });
  }

  const submitted = (subs.data?.items ?? []).filter((s) => s.attemptsUsed > 0);
  const subs404 = subs.isError && axios.isAxiosError(subs.error) && subs.error.response?.status === 404;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Chấm bài</h1>
      <p className="mt-2 text-slate-500">Chọn một bài đã giao, xem bài nộp của lớp rồi chỉnh điểm và gửi nhận xét cho học sinh.</p>

      <div className="mt-6">
        {assignments.isError ? (
          <ErrorBox message={getErrorMessage(assignments.error, "Không tải được danh sách bài đã giao.")} onRetry={() => assignments.refetch()} />
        ) : assignments.isLoading ? (
          <div role="status" aria-label="Đang tải" className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-64" />
          </div>
        ) : list.length === 0 ? (
          <Empty title="Chưa có bài nào đã giao" text="Hãy giao một bài cho lớp, bài nộp của học sinh sẽ hiện ở đây để chấm." />
        ) : (
          <>
            <div>
              <label htmlFor="grading-assignment" className="mb-1.5 block text-sm font-bold text-slate-900">
                Bài đã giao
              </label>
              <select
                id="grading-assignment"
                value={selectedId}
                onChange={(e) => choose(Number(e.target.value))}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base sm:text-sm font-semibold text-slate-800 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
              >
                {list.map((a) => (
                  <option key={a.assignmentId} value={a.assignmentId}>
                    {a.exercise.topic} • {a.class.name} • {typeLabel(a.exercise.type)} • hạn {formatDueFull(a.dueAt)}
                  </option>
                ))}
              </select>
              {assignments.data?.truncated && <p className="mt-1 text-xs text-slate-500">Chỉ hiện {formatNumber(list.length)} bài giao gần nhất.</p>}
            </div>

            <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="grading-subs">
              {selected && (
                <div className="mb-4">
                  <h2 id="grading-subs" className="font-heading text-xl font-bold text-slate-900">
                    {selected.exercise.topic}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.class.name} • {typeLabel(selected.exercise.type)} • Đã nộp {formatNumber(selected.submittedCount)}/{formatNumber(selected.totalStudents)} học sinh
                  </p>
                </div>
              )}
              {subs.isError ? (
                subs404 ? (
                  <Empty title="Không tìm thấy bài giao" text="Bài giao không tồn tại hoặc không thuộc lớp của thầy/cô." />
                ) : (
                  <ErrorBox message={getErrorMessage(subs.error, "Không tải được bài nộp của lớp.")} onRetry={() => subs.refetch()} />
                )
              ) : subs.isLoading || !subs.data ? (
                <div role="status" aria-label="Đang tải" className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-14" />
                  ))}
                </div>
              ) : submitted.length === 0 ? (
                <Empty title="Chưa có học sinh nào nộp bài" text="Khi học sinh nộp bài, bài sẽ hiện ở đây để thầy/cô chấm." />
              ) : (
                <SubmissionsTable items={submitted} maxAttempts={subs.data.assignment.maxAttempts} />
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
