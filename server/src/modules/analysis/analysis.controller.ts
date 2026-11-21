import { Role } from "@prisma/client";
import type { RequestHandler } from "express";
import { failure, success } from "../../utils/response";
import { StudentProfileNotFoundError } from "../skill-profiles/skill-profiles.service";
import { AnalysisInputError, prepareAnalysis, type AnalysisScope } from "./analysis.service";

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
      const teacherId = user.role === Role.TEACHER ? user.id : undefined;
      return success(res, await prepareAnalysis(scope, id, teacherId));
    } catch (error) {
      if (error instanceof StudentProfileNotFoundError || error instanceof AnalysisInputError) {
        return failure(res, error.code, error.message, error.statusCode);
      }
      return next(error);
    }
  };
};