import { Router } from "express";
import { Role } from "@prisma/client";
import * as exercisesController from "./exercises.controller";
import {
  createExerciseSchema,updateExerciseSchema,rejectExerciseSchema,} from "./exercises.schema";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { aiRateLimit } from "../../middlewares/aiRateLimit";
import { generateExerciseSchema } from "./exercises.generate.schema";
import * as generateController from "./exercises.generate.controller";

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

// Đăng ký trước /:id; body sai bị chặn trước khi kiểm tra/ghi log quota AI.
exerciseRoutes.post(
  "/generate",
  requireRole(Role.TEACHER, Role.ADMIN),
  validate(generateExerciseSchema),
  aiRateLimit("generate"),
  generateController.generateExercise
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
// POST /api/v1/exercises/:id/propose (chỉ TEACHER; ADMIN và STUDENT bị 403;
// bài của GV khác hoặc không tồn tại -> 404; status không phải DRAFT -> 409)
exerciseRoutes.post(
  "/:id/propose",
  requireRole(Role.TEACHER),
  exercisesController.proposeExercise
);
// POST /api/v1/exercises/:id/approve (chỉ ADMIN; GV và HS bị 403;
// không tồn tại -> 404; status không phải PROPOSED -> 409)
exerciseRoutes.post(
  "/:id/approve",
  requireRole(Role.ADMIN),
  exercisesController.approveExercise
);

// POST /api/v1/exercises/:id/reject (chỉ ADMIN; GV và HS bị 403; body tùy chọn { reason? };
// không tồn tại -> 404; status không phải PROPOSED -> 409)
exerciseRoutes.post(
  "/:id/reject",
  requireRole(Role.ADMIN),
  validate(rejectExerciseSchema),
  exercisesController.rejectExercise
);