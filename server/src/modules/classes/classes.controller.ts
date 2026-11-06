  import { Request, Response, NextFunction } from "express";
  import { z } from "zod";
  import * as classesService from "./classes.service";
  import { classIdParamSchema, classStudentParamSchema } from "./classes.schema";
  import { success, failure } from "../../utils/response";


// Lỗi nghiệp vụ (có statusCode + code) -> response chuẩn; lỗi lạ -> errorHandler (500)
const handleError = (
  error: unknown,
  res: Response,
  next: NextFunction
) => {
  const err = error as Error & {
    statusCode?: number;
    code?: string;
  };

  if (err.statusCode && err.code) {
    return failure(res, err.code, err.message, err.statusCode);
  }

  next(error);
};

  // Đọc và kiểm tra params trên URL bằng một schema Zod bất kỳ.
  // Sai thì trả 400 và trả về null
  const parseParams = <S extends z.ZodTypeAny>(
    schema: S,
    req: Request,
    res: Response
  ): z.infer<S> | null => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      failure(
        res,
        "VALIDATION_ERROR",
        result.error.issues.map((issue) => issue.message).join(", "),
        400
      );
      return null;
    }

    return result.data;
  };

// POST /api/v1/classes
export const createClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const created = await classesService.createClass(req.user.id, req.body);

    return success(res, created, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};

// POST /api/v1/classes/join
export const joinClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const joined = await classesService.joinClass(req.user.id, req.body);

    return success(res, joined, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};

  // POST /api/v1/classes/:id/students
  export const addStudent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
      }

      const params = parseParams(classIdParamSchema, req, res);
      if (!params) return;

      const added = await classesService.addStudent(
        req.user,
        params.id,
        req.body
      );

      return success(res, added, 201);
    } catch (error) {
      handleError(error, res, next);
    }
  };

    // DELETE /api/v1/classes/:id/students/:studentId
  export const removeStudent = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
      }

      const params = parseParams(classStudentParamSchema, req, res);
      if (!params) return;

      const removed = await classesService.removeStudent(
        req.user,
        params.id,
        params.studentId
      );

      return success(res, removed);
    } catch (error) {
      handleError(error, res, next);
    }
  };

  // GET /api/v1/classes
export const listClasses = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const classes = await classesService.listClasses(req.user);

    return success(res, classes);
  } catch (error) {
    handleError(error, res, next);
  }
};

// GET /api/v1/classes/:id
export const getClass = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    const params = parseParams(classIdParamSchema, req, res);
    if (!params) return;

    const found = await classesService.getClass(req.user, params.id);

    return success(res, found);
  } catch (error) {
    handleError(error, res, next);
  }
};