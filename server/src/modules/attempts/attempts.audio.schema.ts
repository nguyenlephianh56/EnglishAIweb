import { z } from "zod";
import { listAttemptsQuerySchema } from "./attempts.schema";

/**
 * Query của POST /api/v1/attempts/audio?exerciseId=...&assignmentId=...
 *
 * Định danh bài nằm trên QUERY (không phải body multipart) để kiểm quyền được TRƯỚC khi multer
 * ghi file: field trong body chỉ có sau khi parse xong, tức là sau khi file đã xuống đĩa.
 *
 * Tái dùng đúng cách đọc số của GET /attempts (chuỗi số nguyên dương, từ chối "abc", "-1",
 * "1.5", tham số lặp...). Giống createAttemptSchema: bài giao có thể gửi chỉ assignmentId;
 * tự luyện bắt buộc exerciseId. Query thừa (vd studentId) bị bỏ: student_id luôn lấy từ JWT.
 */
export const audioUploadQuerySchema = listAttemptsQuerySchema
  .pick({ assignmentId: true, exerciseId: true })
  .superRefine((data, ctx) => {
    if (data.assignmentId === undefined && data.exerciseId === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exerciseId"],
        message: "exerciseId: Mã bài tập là bắt buộc",
      });
    }
  });

export type AudioUploadQuery = z.infer<typeof audioUploadQuerySchema>;