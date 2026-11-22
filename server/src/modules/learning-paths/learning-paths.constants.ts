// =====================================================================
// learning-paths/learning-paths.constants.ts — Quy tắc gợi ý bài + lộ trình tuần (T24, bản KHÔNG AI).
//
// Đây là NƠI DUY NHẤT chứa các con số/mã/mẫu chữ của T24. Muốn đổi M, N, limit hay mẫu title thì chỉ sửa ở đây.
// File này THUẦN: không import env, Prisma hay DB, nên test chạy được mà không cần .env.
// (config/env.ts import DEFAULT_APP_TIMEZONE từ đây, không phải ngược lại.)
// =====================================================================
import { LOWEST_LEVEL } from "../skill-profiles/skill-profiles.constants";
import type { ProfileLevel } from "../skill-profiles/skill-profiles.constants";

/** Mức dùng khi hồ sơ kỹ năng chưa có `level` (chưa đủ dữ liệu hoặc chưa có hồ sơ). */
export const DEFAULT_TARGET_LEVEL: ProfileLevel = LOWEST_LEVEL;

/** M: tối đa bao nhiêu bài cho MỘT kỹ năng trong một lần gợi ý/lộ trình. */
export const MAX_EXERCISES_PER_SKILL = 2;

/** N: tổng số bài tối đa của một lộ trình tuần. */
export const WEEKLY_PATH_SIZE = 5;

/** `limit` của "Gợi ý cho bạn": mặc định 5, tối đa 10 (= 5 kỹ năng x M = 2, không thể trả nhiều hơn). */
export const RECOMMEND_DEFAULT_LIMIT = 5;
export const RECOMMEND_MAX_LIMIT = 10;

/** Múi giờ mặc định để tính "thứ Hai của tuần". Giá trị chạy thật lấy từ .env APP_TIMEZONE. */
export const DEFAULT_APP_TIMEZONE = "Asia/Ho_Chi_Minh";

/** Mã lý do cố định (KHÔNG dùng AI viết lý do). FE tự đổi mã thành câu chữ. */
export const RECOMMEND_REASONS = {
  /** Kỹ năng đã có điểm; kỹ năng điểm thấp được xếp trước. */
  WEAKEST_SKILL: "weakest_skill",
  /** Kỹ năng chưa có dữ liệu (chưa có dòng skill_profiles). */
  NO_DATA_SKILL: "no_data_skill",
} as const;
export type RecommendReason = (typeof RECOMMEND_REASONS)[keyof typeof RECOMMEND_REASONS];

/** Tên kỹ năng dùng trong `title` của item lộ trình (mẫu tiếng Việt cố định). */
export const SKILL_LABEL_VI = {
  LISTENING: "Nghe",
  SPEAKING: "Nói",
  READING: "Đọc",
  WRITING: "Viết",
  FOUNDATION: "Nền tảng",
} as const;

/**
 * `type` của lỗi chỉ được dùng cho `focus_error_type`/title khi đúng dạng `nhóm` hoặc `nhóm:chi_tiết`
 * (chữ, số, gạch dưới; mỗi phần tối đa 32 ký tự). Dữ liệu này do AI sinh ra nên phải lọc trước khi
 * đưa vào title hay trả cho client.
 */
export const ERROR_TYPE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}(?::[A-Za-z0-9_]{1,32})?$/;

// ---------------------------------------------------------------------
// Lộ trình AI (task `path`). AI chỉ CHỌN + SẮP THỨ TỰ trong danh sách ứng viên do server lọc bằng đúng luật bản không AI.
// ---------------------------------------------------------------------

/** K: tối đa bao nhiêu bài ỨNG VIÊN cho MỘT kỹ năng gửi cho AI (bản luật dùng M = MAX_EXERCISES_PER_SKILL). */
export const AI_CANDIDATES_PER_SKILL = 3;

/** Luôn xét đủ 5 kỹ năng (4c mục 11), nên P (tổng ứng viên) <= 5 x K = 15. Dùng làm `limit` cho recommendExercises. */
export const AI_CANDIDATE_LIMIT = Object.keys(SKILL_LABEL_VI).length * AI_CANDIDATES_PER_SKILL;

/** Độ dài tối đa (theo ký tự Unicode) của `title` do AI viết, sau khi làm sạch. */
export const AI_TITLE_MAX_LENGTH = 120;

/** Độ dài tối đa của `topic` khi đưa vào prompt (topic do GV/AI nhập nên coi là dữ liệu không tin cậy). */
export const AI_TOPIC_MAX_LENGTH = 80;