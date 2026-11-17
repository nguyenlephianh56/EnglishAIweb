import { formatDate, formatTime } from "../../../utils/format";
import type { CriteriaKey, WritingCriteria } from "../../../types/grading";

export const CRITERIA: { key: CriteriaKey; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "coherence", label: "Mạch lạc" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "grammar", label: "Ngữ pháp" },
];

/** Điểm tổng AI gợi ý: trung bình 4 tiêu chí, làm tròn 1 chữ số thập phân */
export const averageScore = (c: WritingCriteria) => Math.round(((c.content + c.coherence + c.vocabulary + c.grammar) / 4) * 10) / 10;

/** 7.5 -> "7,5" */
export const formatScore = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

/** Đọc điểm người dùng gõ (chấp nhận dấu phẩy "7,5"). Trả NaN nếu rỗng hoặc không phải số. */
export function parseScore(raw: string): number {
  const s = raw.trim().replace(",", ".");
  if (s === "") return Number.NaN;
  return Number(s);
}
export const isValidScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10;

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatTime(d)}, ${formatDate(d)}`;
};

const GROUP_LABEL: Record<string, string> = {
  grammar: "Ngữ pháp",
  vocabulary: "Từ vựng",
  spelling: "Chính tả",
  punctuation: "Dấu câu",
  coherence: "Mạch lạc",
  content: "Nội dung",
};
/** "grammar:tense" -> "Ngữ pháp"; nhóm lạ thì giữ nguyên chữ */
export const errorGroupLabel = (type: string) => {
  const group = type.split(":")[0]?.trim().toLowerCase() ?? "";
  return GROUP_LABEL[group] ?? (group || "Khác");
};

// Tìm vị trí lỗi trong bài: dùng chung với trang kết quả của học sinh, nằm ở features/exercises/textMarks.ts
export { locateErrors, splitByErrors } from "../../exercises/textMarks";
export type { ErrorRange, LocatedErrors, TextSegment } from "../../exercises/textMarks";
