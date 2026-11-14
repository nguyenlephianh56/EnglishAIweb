import { BookOpen, CircleCheck, Clock, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatDate, formatTime } from "../../../utils/format";
import type { AppNotification, NotificationType } from "../../../types/notification";

/** Nhãn, icon và màu theo loại thông báo */
export const NOTIFICATION_META: Record<NotificationType, { label: string; icon: LucideIcon; tint: string; text: string }> = {
  DEADLINE: { label: "Nhắc hạn", icon: Clock, tint: "bg-amber-100", text: "text-amber-600" },
  ASSIGNED: { label: "Bài mới", icon: BookOpen, tint: "bg-brand-light", text: "text-brand" },
  RESULT: { label: "Kết quả", icon: CircleCheck, tint: "bg-green-100", text: "text-green-600" },
  AI_TIP: { label: "Gợi ý AI", icon: Sparkles, tint: "bg-violet-100", text: "text-violet-600" },
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 24 * 60 * 60 * 1000;

/** Số ngày lịch giữa hai thời điểm (0 = cùng ngày, 1 = hôm qua...) */
const calendarDaysBetween = (from: Date, now: Date) => Math.round((startOfDay(now) - startOfDay(from)) / DAY);

/** "Vừa xong" / "5 phút trước" / "2 giờ trước" / "Hôm qua, 14:05" / "3 ngày trước" / "23/06/2025" */
export function formatRelativeTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = now.getTime() - d.getTime();
  const days = calendarDaysBetween(d, now);
  if (diff < 60 * 1000) return "Vừa xong";
  if (days === 0) {
    const minutes = Math.floor(diff / (60 * 1000));
    return minutes < 60 ? `${minutes} phút trước` : `${Math.floor(minutes / 60)} giờ trước`;
  }
  if (days === 1) return `Hôm qua, ${formatTime(d)}`;
  if (days < 7) return `${days} ngày trước`;
  return formatDate(d);
}

export interface NotificationGroup {
  key: "today" | "yesterday" | "earlier";
  label: string;
  items: AppNotification[];
}

/** Gom theo ngày: Hôm nay / Hôm qua / Trước đó (giữ nguyên thứ tự mới nhất trước) */
export function groupByDay(items: AppNotification[], now = new Date()): NotificationGroup[] {
  const groups: NotificationGroup[] = [
    { key: "today", label: "Hôm nay", items: [] },
    { key: "yesterday", label: "Hôm qua", items: [] },
    { key: "earlier", label: "Trước đó", items: [] },
  ];
  for (const n of items) {
    const days = calendarDaysBetween(new Date(n.createdAt), now);
    groups[days <= 0 ? 0 : days === 1 ? 1 : 2].items.push(n);
  }
  return groups.filter((g) => g.items.length > 0);
}
