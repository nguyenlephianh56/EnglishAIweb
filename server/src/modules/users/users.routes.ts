import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { validate } from "../../middlewares/validate";
import { changePassword } from "./users.controller";
import { changePasswordSchema } from "./users.schema";

export const userRoutes = Router();

userRoutes.post(
  "/me/password",
  authenticateActiveAccount,
  validate(changePasswordSchema),
  changePassword
);