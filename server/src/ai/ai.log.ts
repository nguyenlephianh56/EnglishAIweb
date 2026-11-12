// ai/ai.log.ts — CỔNG DUY NHẤT để ghi 1 dòng ai_usage_logs (T9).
// Mọi nơi ghi log AI (ai.service.ts, middleware aiRateLimit) đều đi qua `logAiUsage`:
//   1) Kiểm Zod: userId, task, status, tokens. Sai -> KHÔNG ghi, chỉ console mã lỗi.
//   2) Chỉ chuyển đúng 4 trường xuống cổng ghi (trường thừa bị bỏ).
//   3) Ghi lỗi (DB hỏng...) -> nuốt, chỉ console mã lỗi; không retry; không ném lỗi,
//      để kết quả/lỗi trả về cho học sinh không bị đổi.
import { z } from "zod";
import { aiTaskSchema, aiUsageStatusSchema } from "./ai.types";
import type { AiUsageLogEntry, AiUsageLogger } from "./ai.types";

export const AI_LOG_INVALID_CODE = "AI_LOG_INVALID";

export const aiUsageLogEntrySchema = z.object({
  userId: z.number().int().positive(),
  task: aiTaskSchema,
  status: aiUsageStatusSchema,
  /** Số token thật từ provider; không có thì null (không tự ước lượng). */
  tokens: z.number().int().nonnegative().nullable(),
});

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

/** Ghi đúng 1 dòng log. Không bao giờ ném lỗi. Trả true nếu đã ghi. */
export async function logAiUsage(
  logger: AiUsageLogger,
  entry: AiUsageLogEntry
): Promise<boolean> {
  const parsed = aiUsageLogEntrySchema.safeParse(entry);
  if (!parsed.success) {
    // Chỉ báo tên field sai, không in giá trị.
    const fields = [...new Set(parsed.error.issues.map((i) => i.path.join(".") || "(gốc)"))];
    console.error(`[ai/log] ${AI_LOG_INVALID_CODE} fields=${fields.join(",")}`);
    return false;
  }

  const { task, status } = parsed.data;
  try {
    await logger.log(parsed.data);
    return true;
  } catch (error) {
    console.error(`[ai/log] log_failed task=${task} status=${status} code=${errorCode(error)}`);
    return false;
  }
}