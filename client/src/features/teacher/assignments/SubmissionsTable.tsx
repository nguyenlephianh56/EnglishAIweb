import { Link } from "react-router-dom";
import { UserAvatar } from "../../../components/layout/AppLayout";
import { formatScore } from "../../student/assignmentTime";
import { formatRegisteredAt } from "../../../utils/format";
import { SUBMISSION_STATUS_BADGE } from "./assignmentMeta";
import { attemptScoreText, sortedAttempts } from "./attemptMeta";
import type { SubmissionItem } from "../../../types/assignments";

const TH = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400";

/** Điểm cao nhất; đã nộp mà chưa có điểm (ví dụ bài Viết chờ chấm) thì ghi "Chờ chấm" */
function scoreCell(s: SubmissionItem) {
  if (s.bestScore !== null) return <span className="font-bold text-slate-900">{formatScore(s.bestScore)}</span>;
  return s.attemptsUsed > 0 ? <span className="text-xs font-semibold text-slate-500">Chờ chấm</span> : <span className="text-slate-400">—</span>;
}

/**
 * Bảng bài nộp của học sinh trong một bài giao (dùng ở trang chi tiết bài giao và trang Chấm bài).
 * Nút "Chấm bài" chỉ hiện khi có bài nộp để chấm (bestAttemptId khác null).
 */
export default function SubmissionsTable({ items, maxAttempts }: { items: SubmissionItem[]; maxAttempts: number }) {
  return (
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
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((s) => {
            const badge = SUBMISSION_STATUS_BADGE[s.status];
            const attempts = sortedAttempts(s);
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
                  {s.attemptsUsed}/{maxAttempts}
                </td>
                <td className="px-4 py-3">{scoreCell(s)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{s.lastSubmittedAt ? formatRegisteredAt(s.lastSubmittedAt) : "—"}</td>
                <td className="px-4 py-3 text-right">
                  {attempts.length > 0 && (
                    <span className="mb-1 flex flex-wrap justify-end gap-1.5">
                      {attempts.map((a) => (
                        <Link
                          key={a.id}
                          to={`/teacher/grading/${a.id}`}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                            a.is_best ? "border-brand bg-brand-light text-brand" : "border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                          }`}
                        >
                          Lần {a.attempt_no} · {attemptScoreText(a)}
                          {a.is_late && <span className="rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-red-700">Trễ</span>}
                          <span className="sr-only"> của {s.name}</span>
                        </Link>
                      ))}
                    </span>
                  )}
                  {s.bestAttemptId !== null && (
                    <Link
                      to={`/teacher/grading/${s.bestAttemptId}`}
                      className="inline-flex h-10 items-center rounded-xl px-4 text-xs font-bold text-brand hover:bg-brand-light focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                    >
                      Chấm bài
                      <span className="sr-only"> của {s.name}</span>
                    </Link>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
