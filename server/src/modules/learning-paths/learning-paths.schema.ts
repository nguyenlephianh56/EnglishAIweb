// =====================================================================
// learning-paths/learning-paths.schema.ts — Zod cho request của T24.
// =====================================================================
import { z } from "zod";
import { RECOMMEND_DEFAULT_LIMIT, RECOMMEND_MAX_LIMIT } from "./learning-paths.constants";

const LIMIT_MESSAGE = `limit phải là số nguyên từ 1 đến ${RECOMMEND_MAX_LIMIT}`;

/**
 * Query của GET /recommendations/me. `limit` là số nguyên 1..RECOMMEND_MAX_LIMIT.
 * Query string luôn là chuỗi, nên kiểm bằng regex chữ số trước rồi mới đổi sang số
 * (không dùng z.coerce vì nó nhận cả "", "1e1", " 5 ").
 * Tham số lạ khác bị bỏ qua (không gây lỗi), vì chỉ `limit` có nghĩa.
 */
export const recommendationsQuerySchema = z.object({
  limit: z
    .string({ invalid_type_error: LIMIT_MESSAGE })
    .regex(/^\d+$/, LIMIT_MESSAGE)
    .transform(Number)
    .refine((value) => value >= 1 && value <= RECOMMEND_MAX_LIMIT, LIMIT_MESSAGE)
    .optional(),
});

export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

/** Giá trị `limit` cuối cùng (mặc định khi client không gửi). */
export const resolveRecommendationLimit = (query: RecommendationsQuery): number =>
  query.limit ?? RECOMMEND_DEFAULT_LIMIT;