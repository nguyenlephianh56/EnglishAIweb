// thông nhất định dạng json trả về backend
import { Response } from "express";

export const success = (
  res: Response,
  data: unknown,
  status = 200
) => {
  return res.status(status).json({
    data,
    error: null,
  });
};

export const failure = (
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown
) => {
  return res.status(status).json({
    data: null,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
};