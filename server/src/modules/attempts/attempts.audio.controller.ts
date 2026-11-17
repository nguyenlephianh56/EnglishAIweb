import { Request, Response, NextFunction } from "express";
import { success, failure } from "../../utils/response";
import { handleError } from "./attempts.controller";
import { assertCanUploadAudio } from "./attempts.audio.service";
import { verifyUploadedAudio } from "./attempts.audio.upload";
import type { AudioUploadQuery } from "./attempts.audio.schema";

// Bước 1 của POST /api/v1/attempts/audio: kiểm quyền/bài. PHẢI chạy TRƯỚC receiveAudioFile (multer),
// vì multer ghi file xuống đĩa ngay khi nhận được. res.locals.query đã qua validateQuery.
// Bị từ chối ở đây thì chưa có file nào được ghi.
export const authorizeAudioUpload = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    await assertCanUploadAudio(req.user, res.locals.query as AudioUploadQuery);
    next();
  } catch (error) {
    handleError(error, res, next);
  }
};

// Bước 3: sau khi multer đã ghi file. Kiểm chữ ký đầu file (sai thì xóa file), rồi trả
// { audio_id, size_bytes, mime }. Chưa tạo attempt, chưa gọi AI (việc của T18).
export const uploadAudio = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await verifyUploadedAudio(req);
    return success(res, result, 201);
  } catch (error) {
    handleError(error, res, next);
  }
};