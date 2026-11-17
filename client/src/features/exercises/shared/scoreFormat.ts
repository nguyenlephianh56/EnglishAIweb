import type { CriteriaKey } from "../../../types/grading";

/** Bốn tiêu chí chấm bài Viết (thang 10) */
export const CRITERIA: { key: CriteriaKey; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "coherence", label: "Mạch lạc" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "grammar", label: "Ngữ pháp" },
];

/** Số hiển thị kiểu vi-VN: tối đa 1 chữ số thập phân, dấu phẩy ("7,5") */
export const formatScore = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
