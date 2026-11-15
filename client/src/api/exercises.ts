import { api, unwrap } from "./client";
import type { ExerciseListParams, ExerciseListResult } from "../types/exercise";

/**
 * GET /exercises?skill=&level=&type=&topic=&page=&pageSize=
 * Giáo viên: bài của mình + bài thư viện. Học sinh: chỉ bài thư viện đã xuất bản.
 * Sắp xếp mới nhất trước. pageSize mặc định 20, tối đa 50. Tham số undefined không được gửi đi.
 */
export const listExercises = (params: ExerciseListParams = {}) => unwrap<ExerciseListResult>(api.get("/exercises", { params }));
