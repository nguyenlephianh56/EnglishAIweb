import { ArrowRight } from "lucide-react";
import Button from "../../components/ui/Button";
import { SKILL_META } from "../student/skillMeta";
import { formatDueLabel } from "../../utils/format";
import type { AssignmentStatus, RecentAssignment } from "../../types/teacher";

const STATUS: Record<AssignmentStatus, { label: string; tone: string }> = {
  DUE_SOON: { label: "Sắp đến hạn", tone: "bg-amber-50 text-amber-700" },
  ONGOING: { label: "Đang diễn ra", tone: "bg-sky-50 text-sky-700" },
  CLOSED: { label: "Đã đóng", tone: "bg-slate-100 text-slate-600" },
};

const TH = "px-4 py-3 text-xs font-bold tracking-wider text-slate-500";

export default function RecentAssignmentsCard({ assignments }: { assignments: RecentAssignment[] }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-recent">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="h-recent" className="font-heading text-xl font-bold text-slate-900">
            Bài tập gần đây
          </h2>
          <p className="mt-1 text-sm text-slate-500">Theo dõi tiến độ nộp bài của các lớp</p>
        </div>
        <Button to="/teacher/assignments" variant="ghost" size="sm" rightIcon={<ArrowRight />}>
          Xem tất cả
        </Button>
      </div>

      {assignments.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Chưa có bài tập nào được giao.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className={`${TH} rounded-l-xl`}>TÊN BÀI</th>
                <th scope="col" className={TH}>LỚP</th>
                <th scope="col" className={TH}>HẠN NỘP</th>
                <th scope="col" className={TH}>ĐÃ NỘP</th>
                <th scope="col" className={TH}>TRẠNG THÁI</th>
                <th scope="col" className={`${TH} rounded-r-xl`}>
                  <span className="sr-only">Thao tác</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assignments.map((a) => {
                const skill = SKILL_META[a.skill];
                const SkillIcon = skill.icon;
                const percent = a.total > 0 ? Math.round((a.submitted / a.total) * 100) : 0;
                const status = STATUS[a.status];
                const needsGrading = (a.status === "DUE_SOON" || a.status === "CLOSED") && a.ungraded > 0;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-4">
                      {/* Icon và tên nằm cạnh nhau trong một hàng flex, không chồng lên nhau */}
                      <div className="flex items-center gap-3">
                        <span className={`grid size-9 shrink-0 place-items-center rounded-full ${skill.tint} ${skill.text}`} title={skill.label}>
                          <SkillIcon className="size-4" aria-hidden="true" />
                          <span className="sr-only">{skill.label}</span>
                        </span>
                        <span className="font-bold text-slate-900">{a.title}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{a.className}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-700">{formatDueLabel(a.dueAt)}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-28 shrink-0 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`Đã nộp ${percent}%`}>
                          <span className="block h-full rounded-full bg-secondary" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="whitespace-nowrap font-semibold text-slate-700">
                          {a.submitted}/{a.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${status.tone}`}>{status.label}</span>
                    </td>
                    <td className="px-4 py-4">
                      {/* TODO: trỏ tới bài cụ thể khi có route chi tiết */}
                      {needsGrading ? (
                        <Button to="/teacher/grading" variant="ghost" size="sm">
                          Chấm bài
                        </Button>
                      ) : (
                        <Button to="/teacher/assignments" variant="ghost" size="sm">
                          Xem bài
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
