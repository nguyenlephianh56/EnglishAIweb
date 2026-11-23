// =====================================================================
// attempts.suggest.routes.ts — POST /api/v1/attempts/:id/comment-suggestion (T27).
//
// Thứ tự middleware (giống PATCH /:id/grade của T20):
//   token (401) -> TEACHER/ADMIN ACTIVE (403, TRƯỚC khi đụng id) -> id (400) -> body (400)
//   -> phạm vi (404) -> điều kiện (422) -> AI.
// Tiêm hàm `suggest` như createTeacherGradeRouter để test thay được.
// Trả { attempt_id, comment }: chỉ là NHÁP, GV tự lưu bằng PATCH /attempts/:id/grade.
// =====================================================================
import { Role } from "@prisma/client";
import { Router } from "express";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validate, validateParams } from "../../middlewares/validate";
import { failure, success } from "../../utils/response";
import { attemptIdParamSchema, type AttemptIdParam } from "./attempts.schema";
import { SuggestInputError } from "./attempts.suggest.prepare";
import { commentSuggestionBodySchema } from "./attempts.suggest.schema";
import type { CommentSuggestion, CommentSuggestionActor } from "./attempts.suggest.service";

export type CommentSuggestionFn = (
  actor: CommentSuggestionActor,
  attemptId: number,
) => Promise<CommentSuggestion>;

export function createCommentSuggestionRouter(suggest: CommentSuggestionFn) {
  const router = Router();

  router.post(
    "/:id/comment-suggestion",
    authenticateActiveAccount,
    requireRole(Role.TEACHER, Role.ADMIN),
    validateParams(attemptIdParamSchema),
    validate(commentSuggestionBodySchema),
    async (req, res, next) => {
      const user = req.user;
      if (!user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
      if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
        return failure(res, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này", 403);
      }

      try {
        const { id } = res.locals.params as AttemptIdParam;
        return success(res, await suggest({ id: user.id, role: user.role }, id));
      } catch (error) {
        if (
          error instanceof SuggestInputError || error instanceof AIQuotaExceededError ||
          error instanceof AIInvalidFormatError || error instanceof AIServiceError
        ) {
          return failure(res, error.code, error.message, error.statusCode);
        }
        return next(error);
      }
    },
  );

  return router;
}