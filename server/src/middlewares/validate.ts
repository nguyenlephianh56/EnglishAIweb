import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { failure } from "../utils/response";

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        result.error.issues
          .map((issue) => issue.message)
          .join(", "),
        400
      );
    }

    req.body = result.data;
    next();
  };
};

// Kiểm tra query string (?a=1&b=2). Kết quả đã parse để ở res.locals.query
// (không ghi đè req.query để tránh sai kiểu: query luôn là chuỗi, kết quả parse có thể là số).
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        result.error.issues.map((issue) => issue.message).join(", "),
        400
      );
    }

    res.locals.query = result.data;
    next();
  };
};

// Kiểm tra tham số đường dẫn (/attempts/:id). Kết quả để ở res.locals.params.
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      return failure(
        res,
        "VALIDATION_ERROR",
        result.error.issues.map((issue) => issue.message).join(", "),
        400
      );
    }

    res.locals.params = result.data;
    next();
  };
};