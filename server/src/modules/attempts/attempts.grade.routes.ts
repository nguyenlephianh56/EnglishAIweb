import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validate, validateParams } from "../../middlewares/validate";
import { failure, success } from "../../utils/response";
import { teacherGradeSchema, type TeacherGradeInput } from "./attempts.grade.schema";
import type { TeacherGradeActor, TeacherGradeResult } from "./attempts.grade.service";
import { attemptIdParamSchema, type AttemptIdParam } from "./attempts.schema";

type UpdateTeacherGrade = (
  actor: TeacherGradeActor,
  attemptId: number,
  input: TeacherGradeInput
) => Promise<TeacherGradeResult | null>;

export function createTeacherGradeRouter(updateTeacherGrade: UpdateTeacherGrade) {
  const router = Router();

  router.patch(
    "/:id/grade",
    authenticateActiveAccount,
    requireRole(Role.TEACHER, Role.ADMIN),
    validateParams(attemptIdParamSchema),
    validate(teacherGradeSchema),
    async (req, res, next) => {
      try {
        const { id } = res.locals.params as AttemptIdParam;
        const result = await updateTeacherGrade(
          req.user!,
          id,
          req.body as TeacherGradeInput
        );
        if (result === null) {
          return failure(res, "NOT_FOUND", "Không tìm thấy bài nộp", 404);
        }
        return success(res, result);
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}