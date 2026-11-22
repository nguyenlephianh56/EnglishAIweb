// =====================================================================
// attempts.suggest.prepare.ts — Chuẩn bị đầu vào AI cho "Gợi ý nhận xét" (T27).
//
// Thứ tự: phạm vi (404) -> điều kiện nghiệp vụ (422) -> dựng biến. Bị từ chối ở bước nào cũng
// NÉM LỖI TRƯỚC KHI gọi AI: không prompt, không provider, không ghi ai_usage_logs, không tốn lượt.
// Không ghi DB. Message lỗi cố định, không chứa dữ liệu bài nộp.
// =====================================================================
import {
  buildSuggestVariables,
  evaluateSuggestable,
  type SuggestVariables,
} from "./attempts.suggest.input";
import { findSuggestAttempt, type SuggestActor } from "./attempts.suggest.scope";

export const SUGGEST_NOT_FOUND_MESSAGE = "Không tìm thấy bài nộp";

export class SuggestInputError extends Error {
  constructor(
    readonly statusCode: 404 | 422,
    readonly code: "NOT_FOUND" | "UNSUPPORTED_EXERCISE_TYPE" | "NO_TEXT_TO_COMMENT",
    message: string,
  ) {
    super(message);
    this.name = "SuggestInputError";
  }
}

export async function prepareSuggest(
  actor: SuggestActor,
  attemptId: number,
): Promise<{ attemptId: number; variables: SuggestVariables }> {
  const row = await findSuggestAttempt(actor, attemptId);
  if (row === null) throw new SuggestInputError(404, "NOT_FOUND", SUGGEST_NOT_FOUND_MESSAGE);

  const check = evaluateSuggestable(row.exercise.type, row.answer);
  if (!check.ok) throw new SuggestInputError(422, check.code, check.message);

  return { attemptId, variables: buildSuggestVariables(row.exercise, row) };
}