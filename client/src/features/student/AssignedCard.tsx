import { ArrowRight, Calendar } from "lucide-react";
import Button from "../../components/ui/Button";
import { ANY_SKILL_META } from "./skillMeta";
import { classLabel, describeTimeLeft, formatDueShort, formatScore } from "./assignmentTime";
import type { AssignmentItem } from "../../types/assignments";

const BADGE = "rounded-full px-3 py-1.5 text-xs font-bold";
const TONE = { sky: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700", green: "bg-green-50 text-green-700", red: "bg-red-50 text-red-700" };

function actionFor(item: AssignmentItem) {
  if (item.status === "NOT_STARTED") return { label: "Làm bài", variant: "primary" as const };
  if (item.status === "OVERDUE") return { label: "Làm bù", variant: "primary" as const };
  return item.attemptsUsed < item.maxAttempts ? { label: "Làm lại", variant: "outline" as const } : { label: "Xem kết quả", variant: "outline" as const };
}

export default function AssignedCard({ item, now }: { item: AssignmentItem; now?: Date }) {
  const skill = ANY_SKILL_META[item.exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
  const SkillIcon = skill.icon;
  const time = describeTimeLeft(item.dueAt, now);
  const action = actionFor(item);
  // Chữ đỏ chỉ dành cho bài quá hạn mà chưa làm; bài đã nộp thì chữ trung tính
  const timeClass = item.status === "OVERDUE" ? "text-red-600" : item.status === "NOT_STARTED" && time.tone === "urgent" ? "text-amber-600" : "text-slate-500";

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 pl-8 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${skill.bar}`} aria-hidden="true" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 ${BADGE} ${skill.tint} ${skill.text}`}>
            <SkillIcon className="size-3.5" aria-hidden="true" />
            {skill.label}
          </span>
          <span className={`${BADGE} bg-green-50 text-green-700`}>{item.exercise.level}</span>
        </p>
        <p className="flex flex-wrap items-center justify-end gap-2">
          {item.status === "NOT_STARTED" && <span className={`${BADGE} ${TONE.sky}`}>Chưa làm</span>}
          {item.status === "NOT_STARTED" && time.hoursLeft > 0 && time.hoursLeft < 24 && <span className={`${BADGE} ${TONE.amber}`}>Sắp đến hạn</span>}
          {item.status === "SUBMITTED" && <span className={`${BADGE} ${TONE.green}`}>Đã nộp</span>}
          {item.status === "SUBMITTED" && item.lateSubmission && <span className={`${BADGE} ${TONE.red}`}>Nộp trễ</span>}
          {item.status === "OVERDUE" && <span className={`${BADGE} ${TONE.red}`}>Quá hạn</span>}
        </p>
      </div>

      <h3 className="mt-4 font-heading text-lg font-bold text-slate-900">{item.exercise.topic || "Bài tập"}</h3>
      <p className="mt-2 text-sm text-slate-500">{classLabel(item.class.name)}</p>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Calendar className="size-4 text-slate-400" aria-hidden="true" />
          <span className="font-semibold text-slate-700">{formatDueShort(item.dueAt)}</span>
          <span className={`font-semibold ${timeClass}`}>• {time.text}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <p className="text-xs text-slate-500">
            <span className="block">
              Đã làm {item.attemptsUsed}/{item.maxAttempts} lần
            </span>
            {item.bestScore !== null && <span className="mt-0.5 block font-semibold text-slate-700">Điểm cao nhất: {formatScore(item.bestScore)}</span>}
          </p>
          <Button to={`/student/assigned/${item.assignmentId}`} size="sm" variant={action.variant} rightIcon={<ArrowRight />}>
            {action.label}
          </Button>
        </div>
      </div>
    </article>
  );
}
