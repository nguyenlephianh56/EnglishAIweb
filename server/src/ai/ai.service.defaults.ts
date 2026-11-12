// =====================================================================
// ai/ai.service.defaults.ts — Các cổng THẬT cho ai.service.ts (Gemini + Prisma + env).
//
// Tách riêng để ai.service.ts không import env/Gemini/Prisma lúc nạp file
// (test ai.service dùng cổng giả, không cần .env hay DB). File này chỉ được nạp
// khi runAiTask được gọi mà thiếu cổng.
//
// Dùng 1 bộ duy nhất cho cả tiến trình (cache phải giữ nguyên giữa các lượt gọi).
// =====================================================================
import { InMemoryAiCache } from "./ai.cache";
import type { AiServiceDeps } from "./ai.service";
import { createPrismaUsageCounter, createPrismaUsageLogger } from "./ai.usage";
import { dailyLimitsFromEnv } from "./ai.usage.config";
import { GeminiProvider } from "./gemini.provider";
import { withResilience } from "./resilience";
import { resilienceOptionsFromEnv } from "./resilience.config";
import { env } from "../config/env"
import { cacheableTasksFromEnv } from "./ai.cache.config";

let instance: Omit<AiServiceDeps, "now"> | undefined;

export function getDefaultAiDeps(): Omit<AiServiceDeps, "now"> {
  if (!instance) {
    instance = {
      provider: withResilience(new GeminiProvider(), resilienceOptionsFromEnv()),
      cache: new InMemoryAiCache({
        ttlMs: env.AI_CACHE_TTL_SECONDS * 1000,
        maxEntries: env.AI_CACHE_MAX_ENTRIES,
      }),
      counter: createPrismaUsageCounter(),
      logger: createPrismaUsageLogger(),
      limits: dailyLimitsFromEnv(),
    model: env.GEMINI_MODEL,
    cacheableTasks: cacheableTasksFromEnv(),
    };
  }
  return instance;
}