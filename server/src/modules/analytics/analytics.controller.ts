// TODO: analytics - controller
import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/response";
import type { AnalyticsOverviewQuery } from "./analytics.schema";
import { getAnalyticsOverview } from "./analytics.service";

export async function getAnalyticsOverviewHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const query = res.locals.query as AnalyticsOverviewQuery;
    return success(res, await getAnalyticsOverview(query));
  } catch (error) {
    return next(error);
  }
}