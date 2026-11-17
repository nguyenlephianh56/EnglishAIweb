// TODO: skill-profiles - controller
// =====================================================================
// skill-profiles/skill-profiles.controller.ts — Nhận request, gọi service, trả response chuẩn (T15).
//
// Controller KHÔNG tự truy vấn DB. Quyền theo vai trò đã được requireRole chặn ở route; ở đây chỉ quyết
// định "xem ai" và "có giới hạn lớp của GV không", rồi giao cho getStudentSkillProfile.
// =====================================================================
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { failure, success } from "../../utils/response";
import { getStudentSkillProfile, StudentProfileNotFoundError } from "./skill-profiles.service";
import type { StudentIdParam } from "./skill-profiles.schema";

// Lỗi 404 đã biết -> response chuẩn; lỗi lạ -> errorHandler (500, không lộ chi tiết).
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  if (error instanceof StudentProfileNotFoundError) {
    return failure(res, error.code, error.message, error.statusCode);
  }
  return next(error);
};

// GET /api/v1/skill-profiles/me — chỉ STUDENT. studentId lấy từ token, KHÔNG nhận từ client.
export const getMyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);

    const data = await getStudentSkillProfile(req.user.id);
    return success(res, data);
  } catch (error) {
    return handleError(error, res, next);
  }
};

// GET /api/v1/skill-profiles/students/:studentId — TEACHER (chỉ HS trong lớp của mình) hoặc ADMIN (mọi HS).
export const getStudentProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);

    // Đã qua validateParams nên studentId là số nguyên dương hợp lệ.
    const { studentId } = res.locals.params as StudentIdParam;

    // Chỉ ADMIN được xem không giới hạn; GV luôn bị giới hạn theo lớp của chính mình.
    // Vai trò khác (không thể tới đây vì requireRole đã chặn) bị từ chối, để không bao giờ rơi vào nhánh "không giới hạn".
    let teacherId: number | undefined;
    if (req.user.role === Role.TEACHER) {
      teacherId = req.user.id;
    } else if (req.user.role !== Role.ADMIN) {
      return failure(res, "FORBIDDEN", "Bạn không có quyền truy cập chức năng này", 403);
    }

    const data = await getStudentSkillProfile(studentId, { teacherId });
    return success(res, data);
  } catch (error) {
    return handleError(error, res, next);
  }
};