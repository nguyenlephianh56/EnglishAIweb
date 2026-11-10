import { Request, Response, NextFunction } from "express";
import * as exercisesService from "./exercises.service";
import { exerciseIdParamSchema } from "./exercises.schema";
import { success, failure } from "../../utils/response";

// Lỗi nghiệp vụ (có statusCode + code) -> response chuẩn; lỗi lạ -> errorHandler (500)
const handleError = (error: unknown, res: Response, next: NextFunction) => {
  const err = error as Error & {
    statusCode?: number;
    code?: string;
  };

  if (err.statusCode && err.code) {
    return failure(res, err.code, err.message, err.statusCode);
  }

  next(error);
};

// POST /api/v1/exercises
// req.body đã qua validate(createExerciseSchema): đã trim, đã bỏ field thừa.
// content/answer sẽ được service kiểm tiếp bằng T1.
export const createExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const created = await exercisesService.createExercise(req.user, req.body);

    return success(res, created, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/exercises/:id
// :id kiểm bằng Zod tại đây (middleware validate hiện chỉ kiểm req.body).
export const getExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const parsedId = exerciseIdParamSchema.safeParse(req.params);

    if (!parsedId.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        parsedId.error.issues.map((issue) => issue.message).join(", "),
        400
      );
    }

    const exercise = await exercisesService.getExerciseById(
      req.user,
      parsedId.data.id
    );

    return success(res, exercise, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};

// Đọc :id từ đường dẫn. Sai định dạng -> tự trả 400 và trả về null (nơi gọi chỉ cần return).
const parseExerciseId = (req: Request, res: Response): number | null => {
  const parsedId = exerciseIdParamSchema.safeParse(req.params);

  if (!parsedId.success) {
    failure(
      res,
      "VALIDATION_ERROR",
      parsedId.error.issues.map((issue) => issue.message).join(", "),
      400
    );
    return null;
  }

  return parsedId.data.id;
};

// PATCH /api/v1/exercises/:id
// req.body đã qua validate(updateExerciseSchema): đã trim, đã bỏ field cấm/field thừa.
// content/answer sẽ được service gộp với dữ liệu cũ rồi kiểm tiếp bằng T1.
export const updateExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseExerciseId(req, res);
    if (id === null) return;

    const updated = await exercisesService.updateExercise(
      req.user,
      id,
      req.body
    );

    return success(res, updated, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};
// DELETE /api/v1/exercises/:id
// Ẩn bài tập bằng cách chuyển status thành HIDDEN, không xóa khỏi database.
export const deleteExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseExerciseId(req, res);
    if (id === null) return;

    const hidden = await exercisesService.hideExercise(req.user, id);

    return success(res, hidden, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};
// POST /api/v1/exercises/:id/propose
// GV đề xuất bài DRAFT của mình: DRAFT -> PROPOSED. Không có body.
export const proposeExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseExerciseId(req, res);
    if (id === null) return;

    const proposed = await exercisesService.proposeExercise(req.user, id);

    return success(res, proposed, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};
// POST /api/v1/exercises/:id/approve
// ADMIN duyệt bài PROPOSED: -> PUBLISHED + inLibrary = true. Không có body.
export const approveExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseExerciseId(req, res);
    if (id === null) return;

    const approved = await exercisesService.approveExercise(req.user, id);

    return success(res, approved, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};

// POST /api/v1/exercises/:id/reject
// ADMIN từ chối đề xuất: PROPOSED -> DRAFT. Body tùy chọn { reason? } đã qua
// validate(rejectExerciseSchema): đã trim, field thừa đã bị bỏ.
export const rejectExercise = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const id = parseExerciseId(req, res);
    if (id === null) return;

    const rejected = await exercisesService.rejectExercise(
      req.user,
      id,
      req.body?.reason
    );

    return success(res, rejected, 200);
  } catch (error) {
    handleError(error, res, next);
  }
};