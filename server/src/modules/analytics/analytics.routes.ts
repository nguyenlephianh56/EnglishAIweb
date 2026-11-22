import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validateQuery } from "../../middlewares/validate";
import { getAnalyticsOverviewHandler } from "./analytics.controller";
import { analyticsOverviewQuerySchema } from "./analytics.schema";

export const analyticsRoutes = Router();

analyticsRoutes.get(
  "/overview",
  authenticateActiveAccount,
  requireRole(Role.ADMIN),
  validateQuery(analyticsOverviewQuerySchema),
  getAnalyticsOverviewHandler
);