// =====================================================================
// ai/ai.usage.config.ts — Đọc giới hạn lượt/ngày từ .env (qua env.ts).
//
// Tách riêng như resilience.config.ts: ai.usage.ts không phụ thuộc env,
// nên test không cần DATABASE_URL/JWT_SECRET. Biến đã có sẵn trong .env.example:
//   AI_DAILY_LIMIT_STUDENT (mặc định 10), AI_DAILY_LIMIT_TEACHER (mặc định 50).
// =====================================================================
import { env } from "../config/env";
import type { AiDailyLimits } from "./ai.usage";

export function dailyLimitsFromEnv(): AiDailyLimits {
  return {
    student: env.AI_DAILY_LIMIT_STUDENT,
    teacher: env.AI_DAILY_LIMIT_TEACHER,
  };
}