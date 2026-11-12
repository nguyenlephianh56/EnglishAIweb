import type { AssignmentStatus } from "../../types/assignment";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const pad = (n: number) => String(n).padStart(2, "0");

/** "20:00, 25/06" */
export const formatDueShort = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/** 8.5 -> "8,5", 8 -> "8", 7.25 -> "7,25" */
export const formatScore = (n: number) => new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(n);

export type TimeTone = "normal" | "urgent" | "late";

/**
 * Chữ còn lại / quá hạn tính từ dueAt:
 * "Còn 2 ngày", "Còn 6 giờ", "Còn 25 phút", "Quá hạn 1 ngày", "Quá hạn 3 giờ", "Vừa quá hạn".
 * urgent = còn dưới 24 giờ; late = đã qua hạn.
 */
export function describeTimeLeft(dueAt: string, now: Date = new Date()): { text: string; tone: TimeTone; hoursLeft: number } {
  const diff = new Date(dueAt).getTime() - now.getTime();
  const hoursLeft = diff / HOUR;
  if (diff > 0) {
    if (diff >= DAY) return { text: `Còn ${Math.floor(diff / DAY)} ngày`, tone: "normal", hoursLeft };
    if (diff >= HOUR) return { text: `Còn ${Math.floor(diff / HOUR)} giờ`, tone: "urgent", hoursLeft };
    return { text: `Còn ${Math.max(1, Math.ceil(diff / MIN))} phút`, tone: "urgent", hoursLeft };
  }
  const over = -diff;
  if (over >= DAY) return { text: `Quá hạn ${Math.floor(over / DAY)} ngày`, tone: "late", hoursLeft };
  if (over >= HOUR) return { text: `Quá hạn ${Math.floor(over / HOUR)} giờ`, tone: "late", hoursLeft };
  return { text: "Vừa quá hạn", tone: "late", hoursLeft };
}

/** Tên lớp: thêm "Lớp " phía trước nếu tên chưa có (tránh "Lớp Lớp 8A2") */
export const classLabel = (name: string) => (/^lớp\s/i.test(name.trim()) ? name.trim() : `Lớp ${name.trim()}`);

export const ASSIGNMENT_TABS: { id: "all" | AssignmentStatus; label: string; status?: AssignmentStatus }[] = [
  { id: "all", label: "Tất cả" },
  { id: "NOT_STARTED", label: "Chưa làm", status: "NOT_STARTED" },
  { id: "SUBMITTED", label: "Đã nộp", status: "SUBMITTED" },
  { id: "OVERDUE", label: "Quá hạn", status: "OVERDUE" },
];
