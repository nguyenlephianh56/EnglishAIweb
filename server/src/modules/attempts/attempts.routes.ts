import { Router } from "express";
import { Role } from "@prisma/client";
import * as attemptsController from "./attempts.controller";
import {
  attemptIdParamSchema,
  createAttemptSchema,
  listAttemptsQuerySchema,
} from "./attempts.schema";
import {
  validate,
  validateParams,
  validateQuery,
} from "../../middlewares/validate";
import { authenticateActiveAccount } from "../../middlewares/auth";
import { requireRole } from "../../middlewares/requireRole";
import * as attemptsAudioController from "./attempts.audio.controller";
import { audioUploadQuerySchema } from "./attempts.audio.schema";
import { receiveAudioFile } from "./attempts.audio.upload";
import { createTeacherGradeRouter } from "./attempts.grade.routes";
import { updateTeacherGrade } from "./attempts.grade.service";
import { createCommentSuggestionRouter } from "./attempts.suggest.routes";
import { runCommentSuggestion } from "./attempts.suggest.service";
import { createAttemptReviewRouter } from "./attempts.review.routes";
import { findAttemptReview } from "./attempts.review.service";

export const attemptRoutes = Router();

// PATCH /:id/grade dùng middleware riêng để tài khoản PENDING/LOCKED nhận 403.
attemptRoutes.use(createTeacherGradeRouter(updateTeacherGrade));

// POST /:id/comment-suggestion (T27): GV chủ lớp/ADMIN xin AI soạn NHÁP nhận xét, không lưu gì.
attemptRoutes.use(createCommentSuggestionRouter(runCommentSuggestion));

// GET /:id/review (T30): GV chủ lớp/ADMIN đọc chi tiết bài nộp (chỉ đọc). Không xung đột với GET /:id của HS
// vì Express không khớp "/:id" với "/5/review".
attemptRoutes.use(createAttemptReviewRouter(findAttemptReview));

// Các route bên dưới cũng yêu cầu tài khoản ACTIVE.
attemptRoutes.use(authenticateActiveAccount);

// POST /api/v1/attempts  (chỉ STUDENT; TEACHER/ADMIN bị 403, không token -> 401)
// Thứ tự quan trọng: kiểm quyền TRƯỚC khi kiểm body, để GV/Admin luôn nhận 403.
attemptRoutes.post(
  "/",
  requireRole(Role.STUDENT),
  validate(createAttemptSchema),
  attemptsController.createAttempt
);

// POST /api/v1/attempts/audio?exerciseId=...&assignmentId=...  (T17: upload âm thanh bài Nói; chỉ STUDENT)
// multipart/form-data, đúng 1 file ở field "audio". Chưa tạo attempt (T18 làm tiếp bằng audio_id).
// Thứ tự BẮT BUỘC: quyền vai trò -> query -> quyền/bài (authorizeAudioUpload) -> multer (ghi file) -> kiểm
// chữ ký file. Mọi kiểm quyền nằm TRƯỚC multer nên ca bị từ chối không để lại file.
attemptRoutes.post(
  "/audio",
  requireRole(Role.STUDENT),
  validateQuery(audioUploadQuerySchema),
  attemptsAudioController.authorizeAudioUpload,
  receiveAudioFile,
  attemptsAudioController.uploadAudio
);

// GET /api/v1/attempts  (lịch sử bài nộp của CHÍNH HS; chỉ STUDENT)
// Quyền kiểm TRƯỚC khi kiểm query, để GV/Admin luôn nhận 403 (không phải 400).
attemptRoutes.get(
  "/",
  requireRole(Role.STUDENT),
  validateQuery(listAttemptsQuerySchema),
  attemptsController.listAttempts
);

// GET /api/v1/attempts/:id  (chi tiết 1 lần nộp của CHÍNH HS; chỉ STUDENT)
// Đặt sau route "/" ở trên. Quyền kiểm TRƯỚC khi kiểm :id, để GV/Admin luôn nhận 403.
attemptRoutes.get(
  "/:id",
  requireRole(Role.STUDENT),
  validateParams(attemptIdParamSchema),
  attemptsController.getAttempt
);

// POST /api/v1/attempts/:id/regrade  (chấm lại attempt writing đang chờ chấm; chỉ STUDENT chủ attempt)
// Không nhận body. Quyền kiểm TRƯỚC khi kiểm :id, để GV/Admin luôn nhận 403 (không phải 400/404).
attemptRoutes.post(
  "/:id/regrade",
  requireRole(Role.STUDENT),
  validateParams(attemptIdParamSchema),
  attemptsController.regradeAttempt
);