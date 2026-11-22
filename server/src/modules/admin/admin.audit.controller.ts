import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/response";
import type { ListAuditLogsQuery } from "./admin.audit.schema";
import { listAuditLogs } from "./admin.audit.service";

export async function listAuditLogsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await listAuditLogs(res.locals.query as ListAuditLogsQuery));
  } catch (error) {
    return next(error);
  }
}