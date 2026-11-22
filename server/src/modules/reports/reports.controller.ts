import type { NextFunction, Request, Response } from "express";
import { failure, success } from "../../utils/response";
import type { CreateReportBody, ListReportsQuery, ReportIdParam, UpdateReportBody } from "./reports.schema";
import { createReport, listReports, ReportError, updateReport } from "./reports.service";

function handleReportError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof ReportError) {
    return failure(res, error.code, error.message, error.statusCode);
  }
  return next(error);
}

export async function createReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await createReport(req.user, req.body as CreateReportBody), 201);
  } catch (error) {
    return handleReportError(error, res, next);
  }
}

export async function listReportsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await listReports(res.locals.query as ListReportsQuery));
  } catch (error) {
    return next(error);
  }
}

export async function updateReportHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    const { id } = res.locals.params as ReportIdParam;
    return success(res, await updateReport(req.user.id, id, req.body as UpdateReportBody));
  } catch (error) {
    return handleReportError(error, res, next);
  }
}