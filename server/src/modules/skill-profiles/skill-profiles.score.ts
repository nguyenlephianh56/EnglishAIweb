// =====================================================================
// skill-profiles/skill-profiles.score.ts — Điểm hồ sơ kỹ năng (T14, dòng "chốt cửa sổ trượt").
//
// Hàm THUẦN: không DB, không đọc env, không biết attempt/bài giao là gì. Chỉ nhận MẢNG ĐIỂM đã được
// chọn sẵn (điểm cuối thang 10 = COALESCE(teacher_score, score), mỗi phần tử đại diện 1 bài).
// Việc chọn điểm đại diện của mỗi bài và truy vấn các điểm gần nhất do bước sau lo.
//
// QUY ƯỚC: phần tử ĐẦU mảng = GẦN NHẤT. Cửa sổ trượt lấy N phần tử đầu sau khi đã bỏ phần tử hỏng.
// =====================================================================
import { round2 } from "../grading/utils/score";
import {
  DEFAULT_SKILL_WINDOW_SIZE,
  PROFILE_SCORE_MAX,
  PROFILE_SCORE_MIN,
} from "./skill-profiles.constants";

/** Một điểm đầu vào: có thể NULL/undefined (bài chưa có điểm). */
export type RawScore = number | null | undefined;

const isValidScore = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= PROFILE_SCORE_MIN &&
  value <= PROFILE_SCORE_MAX;

/**
 * Chọn các điểm dùng để tính hồ sơ:
 *  1) BỎ phần tử không hợp lệ (null, undefined, NaN, Infinity, ngoài [0, 10], không phải số);
 *  2) rồi mới lấy `windowSize` phần tử đầu (gần nhất).
 * Bỏ trước, cắt sau: một điểm hỏng không làm cửa sổ hụt mất một bài hợp lệ.
 * Độ dài kết quả chính là `sampleCount` để đưa cho scoreToLevel. Không sửa mảng đầu vào.
 *
 * `windowSize` phải là số nguyên >= 1, sai thì ném RangeError (lỗi lập trình/cấu hình, không phải dữ liệu).
 */
export const selectScores = (
  scores: readonly RawScore[],
  windowSize: number = DEFAULT_SKILL_WINDOW_SIZE
): number[] => {
  if (!Number.isInteger(windowSize) || windowSize < 1) {
    throw new RangeError("Cửa sổ trượt phải là số nguyên >= 1.");
  }
  return scores.filter(isValidScore).slice(0, windowSize);
};

/**
 * `score` hồ sơ = trung bình cộng các điểm đã chọn (xem selectScores), làm tròn 2 chữ số.
 * Không có điểm hợp lệ nào → null (không trả 0 hay NaN, vì 0 là một điểm thật).
 * Ít điểm hơn N thì tính trên số hiện có.
 */
export const calcProfileScore = (
  scores: readonly RawScore[],
  windowSize: number = DEFAULT_SKILL_WINDOW_SIZE
): number | null => {
  const selected = selectScores(scores, windowSize);
  if (selected.length === 0) return null;
  const sum = selected.reduce((total, value) => total + value, 0);
  return round2(sum / selected.length);
};