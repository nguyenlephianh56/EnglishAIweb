// =====================================================================
// attempts.suggest.schema.ts — Body của POST /attempts/:id/comment-suggestion (T27).
// Client KHÔNG gửi gì: không body, `{}` đều hợp lệ; field lạ hoặc kiểu khác object -> 400.
// (Không cho client truyền nội dung/độ dài/điểm: mọi dữ liệu gửi AI lấy từ DB.)
// =====================================================================
import { z } from "zod";

export const COMMENT_SUGGESTION_BODY_MESSAGE = "Yêu cầu này không nhận dữ liệu gửi kèm";

export const commentSuggestionBodySchema = z.preprocess(
  (value) => (value === undefined ? {} : value),
  z
    .object({}, { invalid_type_error: COMMENT_SUGGESTION_BODY_MESSAGE })
    .strict(COMMENT_SUGGESTION_BODY_MESSAGE),
);