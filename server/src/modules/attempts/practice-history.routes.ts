import { ExerciseStatus, Level, Prisma, Role, Skill } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma";
import { requireRole } from "../../middlewares/requireRole";
import { validateParams, validateQuery } from "../../middlewares/validate";
import { failure, success } from "../../utils/response";
import { exerciseTypeSchema } from "../exercises/exercise-content.schema";
import { toStudentView } from "../exercises/exercise-view";
import { round2 } from "./attempt-result";
import { handleError } from "./attempts.controller";
import { attemptIdParamSchema, listAttemptsQuerySchema } from "./attempts.schema";
import { getAttemptDetail } from "./attempts.service";

const PAGE_SIZE = 10;
const historyQuerySchema = listAttemptsQuerySchema.pick({ page: true }).extend({
  skill: z.nativeEnum(Skill).optional(),
  level: z.nativeEnum(Level).optional(),
  type: exerciseTypeSchema.optional(),
  status: z.enum(["graded", "pending"]).optional(),
});

export const practiceHistoryRoutes = Router();

practiceHistoryRoutes.use(requireRole(Role.STUDENT));

practiceHistoryRoutes.get("/", validateQuery(historyQuerySchema), async (req, res, next) => {
  if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
  const { page, skill, level, type, status } = res.locals.query as z.infer<typeof historyQuerySchema>;
  const where: Prisma.AttemptWhereInput = {
    studentId: req.user.id,
    assignmentId: null,
    exercise: { skill, level, type },
    score: status === "pending" ? null : status === "graded" ? { not: null } : undefined,
  };

  try {
    const [total, rows] = await prisma.$transaction([
      prisma.attempt.count({ where }),
      prisma.attempt.findMany({
        where,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          submittedAt: true,
          score: true,
          maxScore: true,
          exercise: { select: { topic: true, skill: true, level: true, type: true } },
        },
      }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    const items = rows.map((row) => ({ ...row, score: row.score === null ? null : round2(row.score) }));
    return success(res, { items, page, pageSize: PAGE_SIZE, total });
  } catch (error) {
    return next(error);
  }
});

practiceHistoryRoutes.get("/:id", validateParams(attemptIdParamSchema), async (req, res, next) => {
  if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);

  try {
    const attempt = await getAttemptDetail(req.user, res.locals.params.id);
    if (attempt.assignmentId !== null) {
      return failure(res, "NOT_FOUND", "Không tìm thấy bài tự luyện đã nộp", 404);
    }

    const exercise = await prisma.exercise.findUnique({
      where: { id: attempt.exerciseId },
      select: {
        id: true, type: true, skill: true, level: true, topic: true,
        content: true, status: true, inLibrary: true,
      },
    });
    if (!exercise) return failure(res, "NOT_FOUND", "Không tìm thấy bài tập", 404);

    return success(res, {
      ...attempt,
      reviewExercise: toStudentView(exercise),
      canRetake: exercise.status === ExerciseStatus.PUBLISHED && exercise.inLibrary,
    });
  } catch (error) {
    return handleError(error, res, next);
  }
});