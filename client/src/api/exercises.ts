import { api, unwrap } from "./client";
import type { StudentExercise } from "../types/attempt";
import type { CreateExercisePayload, ExerciseListItem, ExerciseListParams, ExerciseListResult, GenerateExercisePayload, UpdateExercisePayload } from "../types/exercise";

/**
 * GET /exercises?skill=&level=&type=&topic=&status=&page=&pageSize=
 * Giáo viên: bài của mình (mọi trạng thái) + bài thư viện. Học sinh: chỉ bài thư viện đã xuất bản.
 * Sắp xếp mới nhất trước. pageSize mặc định 20, tối đa 50. Tham số undefined không được gửi đi.
 */
export const listExercises = (params: ExerciseListParams = {}) => unwrap<ExerciseListResult>(api.get("/exercises", { params }));

/** GET /exercises/:id */
export const getExercise = (id: number) => unwrap<ExerciseListItem>(api.get(`/exercises/${id}`));

/** POST /exercises: tạo bài mới (giáo viên: trạng thái DRAFT) */
export const createExercise = (body: CreateExercisePayload) => unwrap<ExerciseListItem>(api.post("/exercises", body));

/** POST /exercises/:id/propose: giáo viên đề xuất bài NHÁP của mình vào thư viện (DRAFT → PROPOSED) */
export const proposeExercise = (id: number) => unwrap<ExerciseListItem>(api.post(`/exercises/${id}/propose`));

/** PATCH /exercises/:id: sửa bài NHÁP của chính mình. Chỉ gửi field đổi (topic, skill, level, content, answer, explanation). */
export const updateExercise = (id: number, body: UpdateExercisePayload) => unwrap<ExerciseListItem>(api.patch(`/exercises/${id}`, body));

/** DELETE /exercises/:id: xóa mềm (bài chuyển sang HIDDEN) */
export const deleteExercise = (id: number) => unwrap<unknown>(api.delete(`/exercises/${id}`));

/** Học sinh: đề của một bài thư viện (không có đáp án). Bài không tồn tại hoặc không thuộc thư viện -> 404. */
export const getStudentExercise = (id: number) => unwrap<StudentExercise>(api.get(`/exercises/${id}`));

/** Thời gian chờ tối đa khi nhờ AI sinh bài: backend có thể gọi mô hình hai lần */
export const GENERATE_TIMEOUT_MS = 60_000;

/** AI soạn một bài. Admin xuất bản ngay, giáo viên nhận bản nháp. */
export const generateExercise = (body: GenerateExercisePayload) => unwrap<ExerciseListItem>(api.post("/exercises/generate", body, { timeout: GENERATE_TIMEOUT_MS }));

/** POST /exercises/:id/publish: admin đưa bài nháp của admin hoặc bài đã ẩn vào thư viện. */
export const publishExercise = (id: number) => unwrap<ExerciseListItem>(api.post(`/exercises/${id}/publish`));

/** POST /exercises/:id/approve (quản trị viên): PROPOSED -> PUBLISHED và vào thư viện. 409 nếu bài không còn ở trạng thái chờ duyệt. */
export const approveExercise = (id: number) => unwrap<ExerciseListItem>(api.post(`/exercises/${id}/approve`));

/** POST /exercises/:id/reject (quản trị viên): PROPOSED -> DRAFT. `reason` (tối đa 1000 ký tự) chỉ lưu trong nhật ký, không gửi cho giáo viên. */
export const rejectExercise = (id: number, reason?: string) => unwrap<ExerciseListItem>(api.post(`/exercises/${id}/reject`, reason ? { reason } : {}));