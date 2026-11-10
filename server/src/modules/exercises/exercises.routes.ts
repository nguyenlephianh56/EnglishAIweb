import { Router } from "express";
import { Role } from "@prisma/client";
import * as exercisesController from "./exercises.controller";
import {
  createExerciseSchema,
  updateExerciseSchema,
} from "./exercises.schema";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const exerciseRoutes = Router();

// Mọi route bài tập đều yêu cầu đăng nhập (authenticate đã chặn PENDING/LOCKED bằng 401)
exerciseRoutes.use(authenticate);

// POST /api/v1/exercises  (TEACHER hoặc ADMIN; STUDENT bị 403)
exerciseRoutes.post(
  "/",
  requireRole(Role.TEACHER, Role.ADMIN),
  validate(createExerciseSchema),
  exercisesController.createExercise
);

// GET /api/v1/exercises/:id  (mọi vai trò đã đăng nhập; quyền xem từng bài do service quyết định)
exerciseRoutes.get("/:id", exercisesController.getExercise);

// PATCH /api/v1/exercises/:id  (TEACHER chủ bài hoặc ADMIN; STUDENT bị 403;
// GV khác nhận 404 từ service)
exerciseRoutes.patch(
  "/:id",
  requireRole(Role.TEACHER, Role.ADMIN),
  validate(updateExerciseSchema),
  exercisesController.updateExercise
);
// DELETE /api/v1/exercises/:id (TEACHER chủ bài hoặc ADMIN; STUDENT bị 403;
// GV khác nhận 404 từ service)
exerciseRoutes.delete(
  "/:id",
  requireRole(Role.TEACHER, Role.ADMIN),
  exercisesController.deleteExercise
);