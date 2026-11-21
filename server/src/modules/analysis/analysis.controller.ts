import { Role } from "@prisma/client";
import type { RequestHandler } from "express";
import { AIQuotaExceededError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { failure, success } from "../../utils/response";
import { StudentProfileNotFoundError } from "../skill-profiles/skill-profiles.service";
import { AnalysisInputError, runAnalysis, type AnalysisScope } from "./analysis.service";

export const analysisHandler = (scope: AnalysisScope): RequestHandler => {
  const param = scope === "student" ? "studentId" : "classId";

  return async (req, res, next) => {
    const user = req.user;
    if (!user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    if (user.role !== Role.TEACHER && user.role !== Role.ADMIN) {
      return failure(res, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này", 403);
    }

    try {
      const id = res.locals.params[param] as number;
      return success(res, await runAnalysis(scope, id, { id: user.id, role: user.role }));
    } catch (error) {
      if (
        error instanceof StudentProfileNotFoundError || error instanceof AnalysisInputError ||
        error instanceof AIQuotaExceededError || error instanceof AIInvalidFormatError ||
        error instanceof AIServiceError
      ) {
        return failure(res, error.code, error.message, error.statusCode);
      }
      return next(error);
    }
  };
};