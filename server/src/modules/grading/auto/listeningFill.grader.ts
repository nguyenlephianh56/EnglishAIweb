import type { Grader } from "../types";
import { gradeBlanks } from "../utils/gradeBlanks";

/** Nhóm lỗi của listening_fill: tính vào kỹ năng Nghe, không gộp vào foundation. */
export const LISTENING_FILL_ERROR_TYPE = "listening:wrong_blank";

/**
 * Chấm nghe điền từ: cùng cách chấm với fill_blank (dùng chung gradeBlanks),
 * chỉ khác `errors[].type` để thống kê đúng kỹ năng.
 */
export const gradeListeningFill: Grader<"listening_fill"> = (
  _content,
  answer,
  studentAnswer
) => gradeBlanks(answer, studentAnswer, LISTENING_FILL_ERROR_TYPE);
