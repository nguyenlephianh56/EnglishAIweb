import { api, unwrap } from "./client";
import type { RecommendationItem } from "../types/recommendation";

/** GET /recommendations/me?limit=N (N từ 1 đến 10): bài gợi ý cho học sinh đang đăng nhập; có thể là mảng rỗng. */
export const getRecommendations = (limit = 1) => unwrap<RecommendationItem[]>(api.get("/recommendations/me", { params: { limit } }));
