import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validateParams } from "../../middlewares/validate";
import { studentIdParamSchema } from "../skill-profiles/skill-profiles.schema";
import { analysisHandler } from "./analysis.controller";
import { classIdParamSchema } from "./analysis.params";

export const analysisRoutes = Router();

analysisRoutes.use(authenticateActiveAccount, requireRole(Role.TEACHER, Role.ADMIN));
analysisRoutes.post("/students/:studentId", validateParams(studentIdParamSchema), analysisHandler("student"));
analysisRoutes.post("/classes/:classId", validateParams(classIdParamSchema), analysisHandler("class"));