import type { NextFunction, Request, Response } from "express";
import type { AiDailyLimits } from "../../ai/ai.usage";
import { getAiDailyLimitsConfig } from "../../ai/ai.usage.settings";
import { failure, success } from "../../utils/response";
import { updateAdminAiLimits } from "./admin.ai-limits.service";

export async function getAdminAiLimitsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    return success(res, await getAiDailyLimitsConfig());
  } catch (error) {
    return next(error);
  }
}

export async function updateAdminAiLimitsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    return success(res, await updateAdminAiLimits(req.user.id, req.body as AiDailyLimits));
  } catch (error) {
    return next(error);
  }
}