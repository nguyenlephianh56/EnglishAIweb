// =====================================================================
// ai/schemas/path.schema.ts — Zod cho JSON AI trả về của lộ trình tuần (T24, task `path`).
//
// AI trả: { "items": [ { "ref": "c3", "title": "..." }, ... ] }  (thứ tự = thứ tự AI sắp).
// Khuôn theo createAnalysisResultSchema (T23): envelope `.strict()`, từng phần tử kiểm RIÊNG và LOẠI phần tử hỏng
// thay vì làm hỏng cả kết quả:
//   - `ref` không thuộc danh sách ứng viên -> loại;  trùng `ref` -> giữ lần đầu;  vượt N -> cắt.
//   - `title` làm sạch (một dòng, không thẻ HTML, tối đa AI_TITLE_MAX_LENGTH); rỗng/không phải chuỗi -> dùng
//     buildItemTitle(skill, level, focus_error_type) của bản luật.
//   - Không còn phần tử hợp lệ nào -> lỗi schema (controller đổi thành AI_INVALID_FORMAT).
// Kết quả chỉ có `ref` + `title`: id bài do server tự ánh xạ từ `ref`.
// =====================================================================
import { z } from "zod";
import { sanitizeOneLine } from "../../modules/learning-paths/learning-paths.ai-text";
import { AI_TITLE_MAX_LENGTH, WEEKLY_PATH_SIZE } from "../../modules/learning-paths/learning-paths.constants";
import { buildItemTitle } from "../../modules/learning-paths/learning-paths.select";

/** Phần ứng viên mà schema cần biết (khớp PathAiInputItem). */
export interface PathSchemaCandidate {
  ref: string;
  skill: string;
  level: string;
  focus_error_type: string | null;
}

export interface PathResultItem {
  ref: string;
  title: string;
}

const envelope = z.object({ items: z.array(z.unknown()) }).strict();

export function createPathResultSchema(candidates: readonly PathSchemaCandidate[], size: number = WEEKLY_PATH_SIZE) {
  const byRef = new Map(candidates.map((candidate) => [candidate.ref, candidate]));

  return envelope.transform(({ items }, ctx) => {
    const seen = new Set<string>();
    const result: PathResultItem[] = [];

    for (const raw of items) {
      if (result.length >= size) break;
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) continue;

      const { ref, title } = raw as { ref?: unknown; title?: unknown };
      if (typeof ref !== "string") continue;
      const candidate = byRef.get(ref);
      if (candidate === undefined || seen.has(ref)) continue;
      seen.add(ref);

      const clean = sanitizeOneLine(title, AI_TITLE_MAX_LENGTH);
      result.push({
        ref,
        title: clean !== "" ? clean : buildItemTitle(candidate.skill, candidate.level, candidate.focus_error_type),
      });
    }

    if (result.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần ít nhất một mục lộ trình hợp lệ" });
      return z.NEVER;
    }
    return { items: result };
  });
}

export type PathResult = z.output<ReturnType<typeof createPathResultSchema>>;