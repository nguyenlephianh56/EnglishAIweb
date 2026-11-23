// =====================================================================
// attempts.review.routes.ts — GET /api/v1/attempts/:id/review (T30).
//
// Thứ tự middleware (giống T20/T27):
//   token (401) -> TEACHER/ADMIN ACTIVE (403, TRƯỚC khi đụng id) -> id (400) -> phạm vi (404)
// Chỉ ĐỌC: không gọi AI, không ghi DB, không ghi audit_logs.
// Tiêm hàm `findReview` như createTeacherGradeRouter để test thay được.
// Mọi trường hợp "không xem được" (id không tồn tại, lớp GV khác, bài tự luyện)
// trả CÙNG một 404, cùng mã và cùng thông báo, để không lộ bài đó có tồn tại hay không.
// =====================================================================
import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validateParams } from "../../middlewares/validate";
import { failure, success } from "../../utils/response";
import { attemptIdParamSchema, type AttemptIdParam } from "./attempts.schema";
import type { AttemptReview, AttemptReviewActor } from "./attempts.review.service";

export type FindAttemptReviewFn = (
  actor: AttemptReviewActor,
  attemptId: number,
) => Promise<AttemptReview | null>;

export function createAttemptReviewRouter(findReview: FindAttemptReviewFn) {
  const router = Router();

  router.get(
    "/:id/review",
    authenticateActiveAccount,
    requireRole(Role.TEACHER, Role.ADMIN),
    validateParams(attemptIdParamSchema),
    async (req, res, next) => {
      const user = req.user;
      if (!user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
      if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
        return failure(res, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này", 403);
      }

      try {
        const { id } = res.locals.params as AttemptIdParam;
        const review = await findReview({ id: user.id, role: user.role }, id);
        if (!review) return failure(res, "NOT_FOUND", "Không tìm thấy bài nộp", 404);
        return success(res, review);
      } catch (error) {
        return next(error);
      }
    },
  );

  return router;
}