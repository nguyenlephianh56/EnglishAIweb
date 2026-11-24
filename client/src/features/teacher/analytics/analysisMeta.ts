import { formatDate, formatTime } from "../../../utils/format";
import type { LibrarySkill } from "../../../types/library";

/** Thứ tự và tên trục của radar: Nghe, Nói, Đọc, Viết, Nền tảng */
export const ANALYSIS_SKILLS: { skill: LibrarySkill; axis: string }[] = [
  { skill: "LISTENING", axis: "Nghe" },
  { skill: "SPEAKING", axis: "Nói" },
  { skill: "READING", axis: "Đọc" },
  { skill: "WRITING", axis: "Viết" },
  { skill: "FOUNDATION", axis: "Nền tảng" },
];

/** Điểm 0..10 → 0..100 (làm tròn) */
export const toPercent = (score: number) => Math.round(Math.min(10, Math.max(0, score)) * 10);

/** "Phân tích lúc HH:mm dd/MM" */
export function generatedAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Phân tích gần đây";
  return `Phân tích lúc ${formatTime(d)} ${formatDate(d).slice(0, 5)}`;
}
