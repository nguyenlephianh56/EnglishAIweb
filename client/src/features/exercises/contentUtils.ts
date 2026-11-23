import { countBlanks } from "./answerUtils";

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * SỐ CÂU tính từ content theo dạng bài. Trả số, hoặc chữ ("AI chấm"), hoặc null nếu không đọc được.
 * multiple_choice: số câu hỏi; fill_blank: số chỗ trống "___"; matching: số cặp (left);
 * error_correction: 1; listening_fill: content.blanks (số hoặc mảng); writing/speaking: "AI chấm".
 * Dùng chung cho Ngân hàng bài tập (giáo viên) và Thư viện luyện tập (học sinh).
 */
export function questionCount(item: { type: string; content?: unknown }): number | "AI chấm" | null {
  const c = asRecord(item.content);
  switch (item.type) {
    case "multiple_choice":
      return Array.isArray(c.questions) ? c.questions.length : null;
    case "fill_blank":
      return typeof c.text === "string" ? countBlanks(c.text) : null;
    case "matching":
      return Array.isArray(c.left) ? c.left.length : null;
    case "error_correction":
      return 1;
    case "listening_fill":
      if (typeof c.blanks === "number") return c.blanks;
      return Array.isArray(c.blanks) ? c.blanks.length : null;
    case "writing":
    case "speaking":
      return "AI chấm";
    default:
      return null;
  }
}
