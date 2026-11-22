// =====================================================================
// ai/schemas/comment-suggest.schema.ts — Khuôn JSON AI trả về cho "Gợi ý nhận xét" (T27).
//
//   { "comment": "..." }   (envelope .strict(): thêm field lạ -> sai định dạng)
//
// Làm sạch `comment` nằm NGAY TRONG schema (transform) để:
//   - nhận xét rỗng sau khi làm sạch bị coi là sai định dạng -> generateJson tự thử lại
//     đúng 1 lần rồi báo AI_INVALID_FORMAT (không cần vòng retry riêng);
//   - kết quả luôn dán thẳng vào PATCH /attempts/:id/grade (T20) được, không bị 400.
// File này chỉ có hàm thuần + Zod, không đụng DB/env.
// =====================================================================
import { z } from "zod";
import { TEACHER_COMMENT_MAX_LENGTH } from "../../modules/attempts/attempts.grade.schema";

/** Thẻ HTML/XML (kể cả `<!-- -->`, `<!DOCTYPE>`). Lặp tới khi hết để bỏ cả kiểu lồng `<<b>script>`. */
const HTML_TAG = /<\/?[A-Za-z!?][^>]*>/g;
/** Ký tự điều khiển (trừ \n), ký tự định dạng vô hình và đổi chiều chữ. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function stripHtml(text: string): string {
  let current = text;
  for (let i = 0; i < 10; i += 1) {
    const next = current.replace(HTML_TAG, "");
    if (next === current) return next;
    current = next;
  }
  return current.replace(/[<>]/g, "");
}

/** Cắt theo đơn vị UTF-16 (cùng cách Zod `.max()` đếm) nhưng không để lại nửa cặp surrogate. */
function cutToLength(text: string, max: number): string {
  if (text.length <= max) return text;
  let cut = text.slice(0, max);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

/**
 * Làm sạch nhận xét AI soạn:
 *  - \r\n, \r, U+2028/2029 -> \n; tab -> khoảng trắng;
 *  - bỏ thẻ HTML và ký tự điều khiển khác (giữ xuống dòng);
 *  - cắt khoảng trắng cuối mỗi dòng; tối đa 1 dòng trống liên tiếp;
 *  - trim; cắt tối đa `max` (mặc định TEACHER_COMMENT_MAX_LENGTH) rồi trim lại.
 * Kết quả (nếu không rỗng) luôn qua được `teacher_comment` của T20.
 */
export function sanitizeSuggestedComment(
  raw: string,
  max: number = TEACHER_COMMENT_MAX_LENGTH,
): string {
  const normalized = raw
    .replace(/\r\n?|[\u2028\u2029]/g, "\n")
    .replace(/\t/g, " ")
    .replace(CONTROL_CHARS, "");
  const lines = stripHtml(normalized)
    .split("\n")
    .map((line) => line.replace(/[ \u00A0]+$/g, "").replace(/^[ \u00A0]+/g, ""));
  const collapsed = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cutToLength(collapsed, max).trim();
}

export const commentSuggestSchema = z
  .object({ comment: z.string() })
  .strict()
  .transform(({ comment }) => ({ comment: sanitizeSuggestedComment(comment) }))
  .refine(({ comment }) => comment.length > 0, "Nhận xét rỗng sau khi làm sạch");

export type CommentSuggestResult = z.output<typeof commentSuggestSchema>;