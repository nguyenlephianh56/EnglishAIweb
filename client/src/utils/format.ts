const nf = new Intl.NumberFormat("vi-VN");
const pf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });
const pad = (n: number) => String(n).padStart(2, "0");

/** 12486 -> "12.486" */
export const formatNumber = (n: number) => nf.format(n);

/** 71.6 -> "71,6%" */
export const formatPercent = (n: number) => `${pf.format(n)}%`;

export const formatTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const formatDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** "Hôm nay, 09:14" / "Hôm qua, 16:32" / "23/06/2025" */
export function formatRegisteredAt(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(d, now)) return `Hôm nay, ${formatTime(d)}`;
  if (sameDay(d, yesterday)) return `Hôm qua, ${formatTime(d)}`;
  return formatDate(d);
}

/** "10:24 hôm nay" hoặc "10:24, 08/11/2026" nếu không phải hôm nay */
export function formatUpdatedAt(timestamp: number, now = new Date()): string {
  const d = new Date(timestamp);
  return sameDay(d, now) ? `${formatTime(d)} hôm nay` : `${formatTime(d)}, ${formatDate(d)}`;
}

/** Lời chào theo giờ trong ngày */
export function greetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Chào buổi sáng";
  if (hour >= 12 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Hạn nộp: "20:00, hôm nay" / "08:00, ngày mai" / "26/06/2025" */
export function formatDueLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (sameDay(d, now)) return `${formatTime(d)}, hôm nay`;
  if (sameDay(d, tomorrow)) return `${formatTime(d)}, ngày mai`;
  return formatDate(d);
}
