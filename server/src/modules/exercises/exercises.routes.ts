import { Router } from "express";
import { Role } from "@prisma/client";
import * as exercisesController from "./exercises.controller";
import { createExerciseSchema } from "./exercises.schema";
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