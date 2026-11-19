import { Link } from "react-router-dom";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { PHASE_BADGE, formatDueFull, phaseOf, typeLabel } from "./assignmentMeta";
import { formatNumber } from "../../../utils/format";
import type { TeacherAssignmentItem } from "../../../types/assignments";

const TH = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400";

function ProgressBar({ submitted, total }: { submitted: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((submitted / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={`Đã nộp ${submitted} trên ${total} học sinh`}
      className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"
    >
      <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Bảng bài đã giao: bài tập, lớp, hạn nộp, đã nộp (kèm thanh tiến độ), trạng thái, nút Chi tiết. Bảng cuộn ngang trên màn hình nhỏ. */
export default function AssignmentsTable({ items, now }: { items: TeacherAssignmentItem[]; now: Date }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">Danh sách bài đã giao</caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={TH}>Bài tập</th>
            <th scope="col" className={TH}>Lớp</th>
            <th scope="col" className={TH}>Hạn nộp</th>
            <th scope="col" className={TH}>Đã nộp</th>
            <th scope="col" className={TH}>Trạng thái</th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((a) => {
            const skill = ANY_SKILL_META[a.exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
            const phase = PHASE_BADGE[phaseOf(a.dueAt, now)];
            return (
              <tr key={a.assignmentId}>
                <td className="px-4 py-4">
                  <span className="flex items-start gap-3">
                    <span className={`mt-1 size-3 shrink-0 rounded-full ${skill.bar}`} title={skill.label} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-bold text-slate-900">{a.exercise.topic}</span>
                      <span className="block text-xs text-slate-500">
                        {skill.label} • {typeLabel(a.exercise.type)} • {a.exercise.level}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-600">{a.class.name}</td>
                <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDueFull(a.dueAt, now)}</td>
                <td className="px-4 py-4">
                  <span className="font-bold text-slate-900">
                    {formatNumber(a.submittedCount)}/{formatNumber(a.totalStudents)}
                  </span>
                  <ProgressBar submitted={a.submittedCount} total={a.totalStudents} />
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-block whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${phase.className}`}>{phase.label}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    to={`/teacher/assignments/${a.assignmentId}`}
                    aria-label={`Chi tiết bài ${a.exercise.topic}, ${a.class.name}`}
                    className="rounded-md text-xs font-bold text-brand hover:text-brand-dark focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                  >
                    Chi tiết
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
