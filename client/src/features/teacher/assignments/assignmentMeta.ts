import { formatDate, formatDueLabel, formatTime } from "../../../utils/format";
import type { AssignmentStatus, TeacherAssignmentItem } from "../../../types/assignments";

const HOUR = 60 * 60 * 1000;

/** Nhãn tiếng Việt của 7 dạng bài */
export const TYPE_LABEL: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  fill_blank: "Điền từ",
  matching: "Nối cặp",
  error_correction: "Sửa lỗi",
  listening_fill: "Nghe điền từ",
  writing: "Viết",
  speaking: "Nói",
};
export const typeLabel = (type: string) => TYPE_LABEL[type] ?? type;

/** Giai đoạn của một bài giao theo hạn nộp: còn xa, sắp đến hạn (dưới 24 giờ), đã quá hạn */
export type AssignmentPhase = "ONGOING" | "DUE_SOON" | "ENDED";

export function phaseOf(dueAt: string, now: Date = new Date()): AssignmentPhase {
  const diff = new Date(dueAt).getTime() - now.getTime();
  if (diff <= 0) return "ENDED";
  return diff < 24 * HOUR ? "DUE_SOON" : "ONGOING";
}

export const PHASE_BADGE: Record<AssignmentPhase, { label: string; className: string }> = {
  DUE_SOON: { label: "Sắp đến hạn", className: "bg-amber-50 text-amber-700" },
  ONGOING: { label: "Đang diễn ra", className: "bg-sky-50 text-sky-700" },
  ENDED: { label: "Đã kết thúc", className: "bg-slate-100 text-slate-600" },
};

export interface AssignmentStats {
  /** Còn hạn (dueAt > bây giờ), gồm cả bài sắp đến hạn */
  ongoing: number;
  /** Còn dưới 24 giờ (tập con của "ongoing") */
  dueSoon: number;
  /** Đã quá hạn */
  ended: number;
}

export function computeStats(items: TeacherAssignmentItem[], now: Date = new Date()): AssignmentStats {
  const stats: AssignmentStats = { ongoing: 0, dueSoon: 0, ended: 0 };
  for (const item of items) {
    const phase = phaseOf(item.dueAt, now);
    if (phase === "ENDED") stats.ended += 1;
    else {
      stats.ongoing += 1;
      if (phase === "DUE_SOON") stats.dueSoon += 1;
    }
  }
  return stats;
}

/** "20:00, hôm nay" / "08:00, ngày mai" / "20:00, 28/06/2026" */
export function formatDueFull(iso: string, now: Date = new Date()): string {
  const label = formatDueLabel(iso, now);
  return /hôm nay|ngày mai/.test(label) ? label : `${formatTime(new Date(iso))}, ${formatDate(new Date(iso))}`;
}

export const SUBMISSION_STATUS_BADGE: Record<AssignmentStatus, { label: string; className: string }> = {
  NOT_STARTED: { label: "Chưa làm", className: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "Đã nộp", className: "bg-green-50 text-green-700" },
  OVERDUE: { label: "Quá hạn", className: "bg-orange-50 text-orange-700" },
};

/** Giá trị cho <input type="datetime-local"> theo giờ máy: "2026-11-16T20:00" */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
