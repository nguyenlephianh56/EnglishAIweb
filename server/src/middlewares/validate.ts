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