/** Khóa 4 tiêu chí chấm bài Viết */
export type CriteriaKey = "content" | "coherence" | "vocabulary" | "grammar";

/** Bốn tiêu chí chấm bài Viết (thang 10) */
export const CRITERIA: { key: CriteriaKey; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "coherence", label: "Mạch lạc" },
  { key: "vocabulary", label: "Từ vựng" },
  { key: "grammar", label: "Ngữ pháp" },
];

/** Ba tiêu chí chấm bài Nói (thang 10) */
export const SPEAKING_CRITERIA: { key: string; label: string }[] = [
  { key: "content", label: "Nội dung" },
  { key: "fluency", label: "Độ trôi chảy" },
  { key: "pronunciation", label: "Phát âm" },
];

/** Số hiển thị kiểu vi-VN: tối đa 1 chữ số thập phân, dấu phẩy ("7,5") */
export const formatScore = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
