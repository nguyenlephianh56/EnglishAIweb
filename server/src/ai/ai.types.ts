// =====================================================================
// ai/ai.types.ts — Kiểu dữ liệu + "cổng" (interface) cho luồng ai.service.ts (T9).
//
// File này CHỈ có kiểu, hằng số, schema Zod và 1 lớp lỗi. KHÔNG có logic nghiệp vụ,
// KHÔNG import prisma/env, nên test import thoải mái, không cần DB hay .env.
//
// Luồng (ráp ở ai.service.ts): giới hạn lượt -> cache -> gọi AI -> Zod -> lưu cache + log.
// Mỗi bước nằm sau một cổng riêng để thay được:
//   - AiUsageCounter : đếm số lượt đã dùng hôm nay
//   - AiCache        : tra / lưu kết quả đã qua Zod
//   - AiUsageLogger  : ghi 1 dòng ai_usage_logs
// =====================================================================
import { z } from "zod";

// ---------------------------------------------------------------------
// task + status (khớp Project.md mục 4: ai_usage_logs.task / status)
// ---------------------------------------------------------------------

/** Các loại việc AI. Kiểm bằng Zod trước khi gọi, vì DB lưu TEXT (không có enum). */
export const AI_TASKS = [
  "grade_writing",
  "grade_speaking",
  "generate",
  "analysis",
  "path",
] as const;

export const aiTaskSchema = z.enum(AI_TASKS);
export type AiTask = z.infer<typeof aiTaskSchema>;

/** Trạng thái ghi vào ai_usage_logs.status. */
export type AiUsageStatus = "ok" | "error" | "cached" | "rate_limited";

// ---------------------------------------------------------------------
// Lỗi hết lượt/ngày (khác RATE_LIMITED của Gemini để FE phân biệt)
// ---------------------------------------------------------------------

/** "Bạn đã hết lượt AI hôm nay" (khác "AI đang bận" = RATE_LIMITED ở resilience.ts). */
export const AI_QUOTA_EXCEEDED_CODE = "AI_QUOTA_EXCEEDED";
export const AI_QUOTA_EXCEEDED_STATUS = 429;

/**
 * Cùng khuôn với AIInvalidFormatError / AIServiceError (có `code` + `statusCode`),
 * nên controller/errorHandler hiện có đọc được ngay.
 * Message cố định, không chứa dữ liệu người dùng.
 */
export class AIQuotaExceededError extends Error {
  readonly code = AI_QUOTA_EXCEEDED_CODE;
  readonly statusCode = AI_QUOTA_EXCEEDED_STATUS;

  constructor() {
    super("Bạn đã dùng hết lượt AI hôm nay. Vui lòng quay lại vào ngày mai.");
    this.name = "AIQuotaExceededError";
  }
}

// ---------------------------------------------------------------------
// 3 cổng
// ---------------------------------------------------------------------

/**
 * Cổng đếm lượt. "Lượt đã dùng" = số dòng ai_usage_logs của user trong ngày
 * (tính theo giờ Việt Nam) có status `ok` hoặc `error`; `cached`/`rate_limited` không tính.
 * `now` do bên gọi truyền vào để test được mốc sang ngày mới.
 */
export interface AiUsageCounter {
  countUsedToday(userId: number, now: Date): Promise<number>;
}

/**
 * Cổng cache. Chỉ lưu kết quả ĐÃ qua Zod, không bao giờ lưu lỗi.
 * `key` là hash sha256 (không phải prompt thô).
 * get: không có (hoặc hết hạn) -> undefined.
 */
export interface AiCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

/** Một dòng ai_usage_logs. Chỉ 4 thông tin này, tuyệt đối không có prompt/bài làm/phản hồi. */
export interface AiUsageLogEntry {
  userId: number;
  task: AiTask;
  status: AiUsageStatus;
  /** input + output nếu provider báo; không có thì null. */
  tokens: number | null;
}

/** Cổng ghi log. Mỗi lượt chạy runAiTask ghi đúng 1 dòng. */
export interface AiUsageLogger {
  log(entry: AiUsageLogEntry): Promise<void>;
}