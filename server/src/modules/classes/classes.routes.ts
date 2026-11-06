import { Router } from "express";
import { Role } from "@prisma/client";
import * as classesController from "./classes.controller";
import { createClassSchema, joinClassSchema,addStudentSchema } from "./classes.schema";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";

export const classRoutes = Router();

// Mọi route lớp đều yêu cầu đăng nhập (authenticate đã chặn PENDING/LOCKED)
classRoutes.use(authenticate);

// POST /api/v1/classes  (chỉ TEACHER; ADMIN và STUDENT bị 403)
classRoutes.post(
  "/",
  requireRole(Role.TEACHER),
  validate(createClassSchema),
  classesController.createClass
);

  // POST /api/v1/classes/join  (chỉ STUDENT)
  // Khai báo TRƯỚC các route có /:id sau này, kẻo "join" bị hiểu là một id
  classRoutes.post(
    "/join",
    requireRole(Role.STUDENT),
    validate(joinClassSchema),
    classesController.joinClass
  );

    // POST /api/v1/classes/:id/students  (GV chủ lớp hoặc ADMIN)
  classRoutes.post(
    "/:id/students",
    requireRole(Role.TEACHER, Role.ADMIN),
    validate(addStudentSchema),
    classesController.addStudent
  );

  // DELETE /api/v1/classes/:id/students/:studentId  (GV chủ lớp hoặc ADMIN)
classRoutes.delete(
  "/:id/students/:studentId",
  requireRole(Role.TEACHER, Role.ADMIN),
  classesController.removeStudent
);

// GET /api/v1/classes  (HS: lớp đã tham gia | GV: lớp của mình | ADMIN: tất cả)
classRoutes.get(
  "/",
  requireRole(Role.STUDENT, Role.TEACHER, Role.ADMIN),
  classesController.listClasses
);

// GET /api/v1/classes/:id  (quyền xem được kiểm ở service theo từng vai trò)
classRoutes.get(
  "/:id",
  requireRole(Role.STUDENT, Role.TEACHER, Role.ADMIN),
  classesController.getClass
);