import { api, unwrap } from "./client";
import type { CreateExercisePayload, ExerciseListItem, ExerciseListParams, ExerciseListResult } from "../types/exercise";

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

/** DELETE /exercises/:id: xóa mềm (bài chuyển sang HIDDEN) */
export const deleteExercise = (id: number) => unwrap<unknown>(api.delete(`/exercises/${id}`));
