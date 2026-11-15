// =====================================================================
// grading/writingScore.ts — Điểm tổng bài Viết (T13, dòng "điểm tổng").
//
// Hàm THUẦN: không DB, không AI, không đọc env. Nằm riêng một file để sau này đổi công thức
// (vd thêm trọng số) chỉ sửa ở đây, nơi nối vào luồng nộp bài không phải đổi.
//
// Công thức đã chốt: trung bình cộng 4 tiêu chí, không trọng số, thang 10, làm tròn 2 chữ số.
// =====================================================================
import { round2 } from "./utils/score";

/** Bốn tiêu chí AI chấm (khớp khuôn Zod ở ai/schemas/writing.schema.ts). */
export interface WritingCriteria {
  content: number;
  coherence: number;
  vocabulary: number;
  grammar: number;
}

/** Thang điểm của bài Viết. Giữ khớp với WRITING_MAX_SCORE (attempts) và max_score trong DB. */
const MIN = 0;
const MAX = 10;

/**
 * Điểm tổng = (content + coherence + vocabulary + grammar) / 4, làm tròn 2 chữ số.
 *
 * Dữ liệu từ AI đã qua Zod nên bình thường luôn hợp lệ. Hàm vẫn kiểm lại (lớp bảo vệ cuối):
 * thiếu tiêu chí, không phải số hữu hạn hoặc ngoài [0, 10] thì ném RangeError, để một điểm
 * hỏng không bao giờ được ghi vào DB. Message cố định, không chứa dữ liệu bài làm.
 */
export const computeWritingScore = (criteria: WritingCriteria): number => {
  const values = [
    criteria.content,
    criteria.coherence,
    criteria.vocabulary,
    criteria.grammar,
  ];

  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < MIN || value > MAX) {
      throw new RangeError("Tiêu chí chấm Viết không hợp lệ.");
    }
  }

  const sum = values[0] + values[1] + values[2] + values[3];
  return round2(sum / 4);
};