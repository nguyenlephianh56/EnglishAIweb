//ket noi API voi cac route lien quan den auth
import { Router } from "express";
import * as authController from "./auth.controller";
import { registerSchema, loginSchema } from "./auth.schema";
import { validate } from "../../middlewares/validate";
import { authenticate } from "../../middlewares/auth";

export const authRoutes = Router();

// POST /api/v1/auth/register
authRoutes.post(
  "/register",
  validate(registerSchema),
  authController.register
);

// POST /api/v1/auth/login
authRoutes.post(
  "/login",
  validate(loginSchema),
  authController.login
);

// GET /api/v1/auth/me
authRoutes.get(
  "/me",
  authenticate,
  authController.me
);
