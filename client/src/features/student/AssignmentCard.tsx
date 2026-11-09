import { ArrowRight, Calendar, Clock } from "lucide-react";
import Button from "../../components/ui/Button";
import { SKILL_META } from "./skillMeta";
import type { Assignment } from "../../types/student";

type Tone = "amber" | "sky" | "green" | "red" | "slate";

const TONE_CLASS: Record<Tone, string> = {
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  slate: "bg-slate-100 text-slate-600",
};

const pad = (n: number) => String(n).padStart(2, "0");
const formatDue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

function isTomorrow(due: Date, now: Date) {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  return due.toDateString() === t.toDateString();
}

/**
 * Huy hiệu theo thời hạn (như thiết kế: bài đã nộp vẫn hiện "Ngày mai"...).
 * Quá hạn thì bài đã nộp ghi "Đã nộp", bài chưa làm ghi "Quá hạn".
 * Chân thẻ: bài chưa làm sắp đến hạn hiện thời gian còn lại, các trường hợp khác hiện giờ hạn.
 */
function describeDeadline(a: Assignment, now = new Date()) {
  const due = new Date(a.dueAt);
  const diff = due.getTime() - now.getTime();
  const date = { icon: Calendar, text: formatDue(due) };
  const submitted = a.status === "SUBMITTED";

  if (diff <= 0) {
    return { badge: submitted ? { text: "Đã nộp", tone: "green" as Tone } : { text: "Quá hạn", tone: "red" as Tone }, footer: date };
  }
  if (diff < 24 * 3600 * 1000) {
    const text = diff < 3600000 ? `Còn ${Math.ceil(diff / 60000)} phút` : `Còn ${Math.ceil(diff / 3600000)} giờ`;
    return { badge: { text: "Sắp đến hạn", tone: "amber" as Tone }, footer: submitted ? date : { icon: Clock, text } };
  }
  if (isTomorrow(due, now)) return { badge: { text: "Ngày mai", tone: "sky" as Tone }, footer: date };
  return { badge: { text: `Còn ${Math.ceil(diff / 86400000)} ngày`, tone: "slate" as Tone }, footer: date };
}

function describeSize(a: Assignment): string {
  if (a.questionCount && a.minutes) return `${a.questionCount} câu • ${a.minutes} phút`;
  if (a.minWords && a.maxWords) return `${a.minWords}–${a.maxWords} từ`;
  return "";
}

export default function AssignmentCard({ assignment: a }: { assignment: Assignment }) {
  const skill = SKILL_META[a.skill];
  const SkillIcon = skill.icon;
  const { badge, footer } = describeDeadline(a);
  const FooterIcon = footer.icon;
  const size = describeSize(a);

  return (
    <article className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 pl-8 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${skill.bar}`} aria-hidden="true" />

      <div className="flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${skill.tint} ${skill.text}`}>
          <SkillIcon className="size-3.5" aria-hidden="true" />
          {skill.label}
        </span>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${TONE_CLASS[badge.tone]}`}>{badge.text}</span>
      </div>

      <h3 className="mt-4 font-heading text-lg font-bold text-slate-900">{a.title}</h3>
      <p className="mt-2 mb-auto text-sm text-slate-500">
        Giáo viên: {a.teacherName} • {a.className}
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-slate-100 pt-4">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <FooterIcon className="size-4" aria-hidden="true" />
          {footer.text}
        </p>
        <div className="flex items-center gap-3">
          {size && <span className="text-sm text-slate-500">{size}</span>}
          {/* TODO: trỏ tới trang làm bài / xem bài khi có route chi tiết */}
          {a.status === "TODO" ? (
            <Button to="/student/assigned" size="sm" rightIcon={<ArrowRight />}>
              Làm bài
            </Button>
          ) : (
            <Button to="/student/assigned" size="sm" variant="outline" rightIcon={<ArrowRight />}>
              Xem bài
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
