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

/**
 * Body của POST /learning-path/me: KHÔNG nhận gì. Lộ trình, title và week_start đều do server quyết định,
 * nên client gửi thêm field (title, exercise_id, week_start, student_id...) là 400. Body trống = {}.
 */
export const createLearningPathBodySchema = z
  .object({})
  .strict({ message: "Không được gửi kèm dữ liệu; lộ trình do hệ thống tạo" });


const MAX_INT4 = 2_147_483_647;

/**
 * `:itemId` phải là số nguyên dương chỉ gồm chữ số (từ chối "abc", "0", "-1", "1.5", "1e3", số quá lớn).
 * Req.params luôn là chuỗi, nên kiểm bằng regex rồi mới đổi sang số.
 */
export const itemIdParamSchema = z.object({
  itemId: z
    .string({ required_error: "Thiếu mã mục lộ trình" })
    .regex(/^\d+$/, "Mã mục lộ trình phải là số nguyên dương")
    .transform((value) => Number(value))
    .refine((value) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_INT4, "Mã mục lộ trình không hợp lệ"),
});

export type ItemIdParam = z.infer<typeof itemIdParamSchema>;

/** Body của PATCH item: chỉ `done` (boolean). Thiếu, sai kiểu hoặc gửi thêm field (title, exercise_id...) là 400. */
export const updateItemBodySchema = z
  .object({
    done: z.boolean({
      required_error: "Thiếu trường done",
      invalid_type_error: "done phải là true hoặc false",
    }),
  })
  .strict({ message: "Chỉ được gửi trường done" });

export type UpdateItemBody = z.infer<typeof updateItemBodySchema>;