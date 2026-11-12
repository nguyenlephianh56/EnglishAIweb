// =====================================================================
// ai/resilience.config.ts — Đọc cấu hình retry từ .env (qua env.ts) cho withResilience.
//
// Tách riêng khỏi resilience.ts để resilience.ts không phụ thuộc env
// (test lớp bao không cần DATABASE_URL/JWT_SECRET...).
//
// Cách dùng (ai.service.ts ở T9):
//   const provider = withResilience(new GeminiProvider(), resilienceOptionsFromEnv());
// Timeout mỗi lần gọi do GeminiProvider tự xử lý bằng AI_TIMEOUT_MS.
// =====================================================================
import { env } from "../config/env";
import type { ResilienceOptions } from "./resilience";

export function resilienceOptionsFromEnv(): ResilienceOptions {
  return {
    retry429Max: env.AI_RETRY_429_MAX,
    retry429DelayMs: env.AI_RETRY_429_DELAY_MS,
    retryNetworkMax: env.AI_RETRY_NETWORK_MAX,
    retryNetworkDelayMs: env.AI_RETRY_NETWORK_DELAY_MS,
  };
}