import { formatDate, formatTime } from "../../../utils/format";
import type { WritingCriteria } from "../../../types/grading";


/** Điểm tổng AI gợi ý: trung bình 4 tiêu chí, làm tròn 1 chữ số thập phân */
export const averageScore = (c: WritingCriteria) => Math.round(((c.content + c.coherence + c.vocabulary + c.grammar) / 4) * 10) / 10;

/** Đọc điểm người dùng gõ (chấp nhận dấu phẩy "7,5"). Trả NaN nếu rỗng hoặc không phải số. */
export function parseScore(raw: string): number {
  const s = raw.trim().replace(",", ".");
  if (s === "") return Number.NaN;
  return Number(s);
}
export const isValidScore = (n: number) => Number.isFinite(n) && n >= 0 && n <= 10;


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

// Dùng chung với trang kết quả của học sinh: xem features/exercises/shared và answerUtils
export { CRITERIA, formatScore } from "../../exercises/shared/scoreFormat";
export { countWords } from "../../exercises/answerUtils";
