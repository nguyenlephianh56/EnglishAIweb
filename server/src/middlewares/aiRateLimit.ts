// middlewares/aiRateLimit.ts — Chặn SỚM (trước controller) khi user đã hết lượt AI trong ngày (T9).
import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  AIQuotaExceededError,
  AIUsageCheckError,
  aiTaskSchema,
} from "../ai/ai.types";
import type { AiTask, AiUsageCounter, AiUsageLogger } from "../ai/ai.types";
import {
  createPrismaUsageCounter,
  createPrismaUsageLogger,
  dailyLimitForRole,
} from "../ai/ai.usage";
import type { AiDailyLimits } from "../ai/ai.usage";
import { failure } from "../utils/response";

/** Các phụ thuộc, truyền vào được để test bằng đối tượng giả. Không truyền thì dùng bản thật. */
export interface AiRateLimitDeps {
  counter: AiUsageCounter;
  logger: AiUsageLogger;
  /** Hàm (không phải giá trị) để đọc cấu hình MỖI request: đổi .env/giá trị thì đổi hành vi. */
  getLimits: () => AiDailyLimits | Promise<AiDailyLimits>;
  now: () => Date;
}

/** Chỉ lấy mã lỗi (nếu có) để log; không lấy message/stack vì có thể chứa chi tiết nội bộ. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

async function defaultGetLimits(): Promise<AiDailyLimits> {
  // Nạp muộn: chỉ khi thật sự cần mới kéo env.ts vào (giống ai.service.ts).
  return (await import("../ai/ai.usage.config")).dailyLimitsFromEnv();
}

export function aiRateLimit(
  task: AiTask,
  deps: Partial<AiRateLimitDeps> = {}
): RequestHandler {
  // `task` sai là lỗi lập trình: báo ngay lúc khai báo route (khi khởi động), không đợi tới request.
  const safeTask = aiTaskSchema.parse(task);

  const counter = deps.counter ?? createPrismaUsageCounter();
  const logger = deps.logger ?? createPrismaUsageLogger();
  const getLimits = deps.getLimits ?? defaultGetLimits;
  const now = deps.now ?? (() => new Date());

  return async (req: Request, res: Response, next: NextFunction) => {
    // Phải có req.user (authenticate chạy trước). Không có -> 401, chưa đụng hàm đếm.
    const user = req.user;
    if (!user) {
      return failure(res, "UNAUTHORIZED", "Vui lòng đăng nhập", 401);
    }

    let used: number;
    let limit: number;
    try {
      limit = dailyLimitForRole(user.role, await getLimits());
      used = await counter.countUsedToday(user.id, now());
    } catch (error) {
      // Không đếm được thì chặn (không cho qua) để khỏi vượt quota Gemini miễn phí.
      console.error(`[ai/rateLimit] check_failed task=${safeTask} code=${errorCode(error)}`);
      return next(new AIUsageCheckError());
    }

    if (used >= limit) {
      try {
        await logger.log({
          userId: user.id,
          task: safeTask,
          status: "rate_limited",
          tokens: null,
        });
      } catch (error) {
        // Log lỗi thì vẫn chặn như thường.
        console.error(`[ai/rateLimit] log_failed task=${safeTask} code=${errorCode(error)}`);
      }
      return next(new AIQuotaExceededError());
    }

    return next();
  };
}