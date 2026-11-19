import ExerciseRowMenu from "./ExerciseRowMenu";
import { formatUpdated, questionCount, STATUS_BADGE, topicSubline } from "./exerciseMeta";
import { typeLabel } from "../assignments/assignmentMeta";
import { ANY_SKILL_META } from "../../student/skillMeta";
import type { ExerciseListItem } from "../../../types/exercise";

interface ExercisesTableProps {
  items: ExerciseListItem[];
  userId: number | undefined;
  busyId: number | null;
  onPropose: (e: ExerciseListItem) => void;
  onDuplicate: (e: ExerciseListItem) => void;
  onDelete: (e: ExerciseListItem) => void;
}

const th = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400";

/** Bảng bài tập: cuộn ngang ở màn nhỏ. Cột "Đã giao" bị bỏ vì backend không có số liệu này. */
export default function ExercisesTable({ items, userId, busyId, onPropose, onDuplicate, onDelete }: ExercisesTableProps) {
  const now = new Date();
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[820px] border-collapse text-sm">
        <caption className="sr-only">Danh sách bài tập</caption>
        <thead>
          <tr className="border-b border-slate-100">
            <th scope="col" className={th}>Tên bài</th>
            <th scope="col" className={th}>Kỹ năng</th>
            <th scope="col" className={th}>Cấp độ</th>
            <th scope="col" className={th}>Số câu</th>
            <th scope="col" className={th}>Trạng thái</th>
            <th scope="col" className={th}>Cập nhật</th>
            <th scope="col" className="w-14 px-4 py-3">
              <span className="sr-only">Thao tác</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((e) => {
            const skill = ANY_SKILL_META[e.skill] ?? ANY_SKILL_META.FOUNDATION;
            const SkillIcon = skill.icon;
            const status = e.status ? STATUS_BADGE[e.status] : undefined;
            const count = questionCount(e);
            const sub = topicSubline(e.topic, e.topic);
            return (
              <tr key={e.id} className={`transition-colors hover:bg-slate-50/60 ${busyId === e.id ? "opacity-50" : ""}`}>
                <td className="max-w-xs px-4 py-4">
                  <p className="truncate font-bold text-slate-900" title={e.topic}>{e.topic}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{sub ?? typeLabel(e.type)}</p>
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${skill.tint} ${skill.text}`}>
                    <SkillIcon className="size-3.5" aria-hidden="true" />
                    {skill.label}
                  </span>
                </td>
                <td className="px-4 py-4 font-semibold text-slate-700">{e.level}</td>
                <td className="px-4 py-4 text-slate-700">{count ?? "—"}</td>
                <td className="px-4 py-4">
                  {status ? <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span> : "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatUpdated(e.updatedAt ?? e.createdAt, now)}</td>
                <td className="px-4 py-4 text-right">
                  <ExerciseRowMenu exercise={e} isOwner={userId !== undefined && e.createdById === userId} busy={busyId === e.id} onPropose={onPropose} onDuplicate={onDuplicate} onDelete={onDelete} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
