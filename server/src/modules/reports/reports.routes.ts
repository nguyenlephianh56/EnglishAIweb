import { Role } from "@prisma/client";
import { Router } from "express";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import { validate, validateParams, validateQuery } from "../../middlewares/validate";
import { createReportHandler, listReportsHandler, updateReportHandler } from "./reports.controller";
import { createReportBodySchema, listReportsQuerySchema, reportIdParamSchema, updateReportBodySchema } from "./reports.schema";

export const reportsRoutes = Router();

reportsRoutes.use(authenticateActiveAccount);
reportsRoutes.post("/", requireRole(Role.STUDENT), validate(createReportBodySchema), createReportHandler);
reportsRoutes.get("/", requireRole(Role.ADMIN), validateQuery(listReportsQuerySchema), listReportsHandler);
reportsRoutes.patch(
  "/:id",
  requireRole(Role.ADMIN),
  validateParams(reportIdParamSchema),
  validate(updateReportBodySchema),
  updateReportHandler
);