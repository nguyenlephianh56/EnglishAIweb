// =====================================================================
// ai/ai.cache.config.ts — Đọc danh sách task được cache từ .env (qua env.ts).
//
// Tách riêng như ai.usage.config.ts: ai.cache.ts / ai.service.ts không phụ thuộc env,
// nên test không cần DATABASE_URL/JWT_SECRET. Biến: AI_CACHE_TASKS
// (mặc định grade_writing,grade_speaking,analysis,path). TTL và số mục tối đa
// (AI_CACHE_TTL_SECONDS, AI_CACHE_MAX_ENTRIES) được nối ở ai.service.defaults.ts.
// =====================================================================
import { env } from "../config/env";
import { parseCacheableTasks } from "./ai.cache";
import type { AiTask } from "./ai.types";

export function cacheableTasksFromEnv(): ReadonlySet<AiTask> {
  const { tasks, ignored } = parseCacheableTasks(env.AI_CACHE_TASKS);
  if (ignored > 0) {
    console.warn(`[ai/cache] AI_CACHE_TASKS có ${ignored} tên task không hợp lệ, đã bỏ qua`);
  }
  return tasks;
}