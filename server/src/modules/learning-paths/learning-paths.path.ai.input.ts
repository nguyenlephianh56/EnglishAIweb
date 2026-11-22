// =====================================================================
// learning-paths/learning-paths.path.ai.input.ts — Dựng ĐẦU VÀO gửi AI cho lộ trình tuần (T24, task `path`). Hàm THUẦN.
//
// Nhận danh sách ứng viên đã do server lọc bằng đúng luật bản không AI (recommendExercises). Mỗi ứng viên được gán
// mã `ref` = c1..cP theo đúng thứ tự ứng viên. AI chỉ nhìn thấy `ref`; server tự ánh xạ `ref` -> id bài thật.
//
// KHÔNG đưa vào đầu vào AI: tên/email/id học sinh, id bài, content, answer, explanation.
// Thứ tự phần tử và thứ tự khóa JSON cố định => cùng dữ liệu cho cùng chuỗi (để cache trúng).
// `topic` do GV/AI tạo nên được làm sạch + cắt; việc bọc thẻ + vô hiệu chuỗi đóng thẻ do buildPrompt (untrusted) làm.
// =====================================================================
import {
  AI_CANDIDATE_LIMIT,
  AI_TOPIC_MAX_LENGTH,
  ERROR_TYPE_PATTERN,
  type RecommendReason,
} from "./learning-paths.constants";
import { sanitizeTopicForPrompt } from "./learning-paths.ai-text";

/** Phần tối thiểu của một ứng viên (SelectedRecommendation<CandidateRow> truyền vào được; field thừa bị bỏ). */
export interface PathAiCandidateSource {
  exercise: { type: string; skill: string; level: string; topic: string | null };
  skill: string;
  level: string;
  reason: RecommendReason;
  focusErrorType: string | null;
}

/** Một phần tử gửi cho AI. Thứ tự khóa ở đây = thứ tự khóa trong JSON. */
export interface PathAiInputItem {
  ref: string;
  skill: string;
  level: string;
  type: string;
  topic: string | null;
  reason: RecommendReason;
  focus_error_type: string | null;
}

export interface PathAiInput {
  items: PathAiInputItem[];
  /** Chuỗi JSON gọn, ổn định; đây là giá trị biến của prompt (bước sau). */
  json: string;
}

/** Mã ref của ứng viên thứ `index` (0-based): "c1", "c2"... */
export const candidateRef = (index: number): string => `c${index + 1}`;

/** Chỉ cho `focus_error_type` đúng dạng `nhóm[:chi_tiết]` đi tiếp (dữ liệu gốc do AI chấm sinh ra). */
const safeFocusErrorType = (value: string | null): string | null =>
  value !== null && ERROR_TYPE_PATTERN.test(value) ? value : null;

/**
 * Dựng đầu vào AI. Chỉ lấy tối đa AI_CANDIDATE_LIMIT ứng viên đầu (an toàn nếu nơi gọi truyền thừa).
 * Danh sách rỗng -> items rỗng (nơi gọi phải chặn trước khi gọi AI).
 */
export const buildPathAiInput = (candidates: readonly PathAiCandidateSource[]): PathAiInput => {
  const items: PathAiInputItem[] = candidates.slice(0, AI_CANDIDATE_LIMIT).map((candidate, index) => ({
    ref: candidateRef(index),
    skill: candidate.skill,
    level: candidate.level,
    type: candidate.exercise.type,
    topic: sanitizeTopicForPrompt(candidate.exercise.topic, AI_TOPIC_MAX_LENGTH),
    reason: candidate.reason,
    focus_error_type: safeFocusErrorType(candidate.focusErrorType),
  }));
  return { items, json: JSON.stringify(items) };
};

/**
 * Bảng ánh xạ ref -> phần tử ứng viên gốc (cùng chỉ số với `buildPathAiInput`). Server dùng bảng này để đổi `ref`
 * AI chọn thành bài thật; AI không bao giờ tự cung cấp id.
 */
export const mapRefsToCandidates = <T>(candidates: readonly T[]): Map<string, T> =>
  new Map(candidates.slice(0, AI_CANDIDATE_LIMIT).map((candidate, index) => [candidateRef(index), candidate]));