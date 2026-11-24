import { api, unwrap } from "./client";
import type { LearningPathView } from "../types/path";

/** GET /learning-path/me: lộ trình tuần này, null nếu chưa có (chỉ học sinh). */
export const getMyLearningPath = () => unwrap<LearningPathView | null>(api.get("/learning-path/me"));

/** POST /learning-path/me, body {}: tạo lộ trình (201) hoặc trả lộ trình đã có (200). 422 NO_EXERCISES_AVAILABLE nếu chưa có bài phù hợp. */
export const createLearningPath = () => unwrap<LearningPathView>(api.post("/learning-path/me", {}));

/** POST /learning-path/me/ai, body {}: nhờ AI soạn lộ trình (chậm, tối đa 60 giây). 429 hết lượt AI, 502/503/504 AI lỗi. */
export const createLearningPathWithAi = () => unwrap<LearningPathView>(api.post("/learning-path/me/ai", {}, { timeout: 60_000 }));

/** PATCH /learning-path/items/:itemId, body {done}: đánh dấu hoàn thành; trả cả lộ trình đã cập nhật. 404 nếu không phải của mình. */
export const setPathItemDone = (itemId: number, done: boolean) => unwrap<LearningPathView>(api.patch(`/learning-path/items/${itemId}`, { done }));
