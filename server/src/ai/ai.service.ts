// ai/ai.service.ts — Điều phối 1 lượt gọi AI (T9):
//
//   (0) kiểm `task` bằng Zod
//   (1) giới hạn lượt/ngày  -> hết lượt: log `rate_limited`, ném AI_QUOTA_EXCEEDED (429),
//                              KHÔNG gọi model, KHÔNG đụng cache
//   (2) tra cache           -> trúng: log `cached`, trả {data, cached:true}
//   (3) gọi AI (generateJson: ép JSON + Zod + retry định dạng, T8)
//                           -> lỗi: log `error` (hoặc `rate_limited` nếu Gemini 429),
//                              ném lại lỗi chuẩn của T8 NGUYÊN VẸN
//   (4) lưu cache (chỉ kết quả đã qua Zod) + log `ok` (kèm tokens nếu có)
import type { z } from "zod";
import { buildAiCacheKey } from "./ai.cache";
import { AIQuotaExceededError, aiTaskSchema } from "./ai.types";
import type {
  AiCache,
  AiTask,
  AiUsageCounter,
  AiUsageLogger,
  AiUsageStatus,
} from "./ai.types";
import { dailyLimitForRole, sumTokens } from "./ai.usage";
import type { AiDailyLimits, AiRole } from "./ai.usage";
import { generateJson } from "./json";
import type { AIProvider } from "./provider";
import { AIServiceError } from "./resilience";

/** Mã lỗi khi `task` ngoài danh sách (lỗi lập trình phía server, không phải lỗi người dùng). */
export const AI_INVALID_TASK_CODE = "AI_INVALID_TASK";

/** Các phụ thuộc của luồng. Provider truyền vào nên là bản ĐÃ bọc withResilience. */
export interface AiServiceDeps {
  provider: AIProvider;
  cache: AiCache;
  counter: AiUsageCounter;
  logger: AiUsageLogger;
  limits: AiDailyLimits;
  model: string;
  cacheableTasks: ReadonlySet<AiTask>;
  now: () => Date;
}

export interface RunAiTaskInput<S extends z.ZodTypeAny> {
  /** Id người dùng, do server lấy từ token. */
  userId: number;
  /** Vai trò, do server lấy từ token; quyết định mức giới hạn lượt. */ 
  role: AiRole;
  /** Loại việc (được kiểm lại bằng Zod ở đây). */
  task: AiTask;
  /** Prompt đã dựng sẵn (việc dựng prompt là của T10). */
  prompt: string;
  /** Zod schema của kết quả mong đợi. */
  schema: S;
}

export interface RunAiTaskResult<T> {
  data: T;
  /** true = lấy từ cache, không gọi model. */
  cached: boolean;
}

/** Lấy mã lỗi (nếu có) để log; tuyệt đối không lấy message/stack vì có thể chứa nội dung. */
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

async function resolveDeps(partial: Partial<AiServiceDeps>): Promise<AiServiceDeps> {
  const needDefaults = !(
    partial.provider &&
    partial.cache &&
    partial.counter &&
    partial.logger &&
    partial.logger &&
    partial.limits &&
    partial.model &&
    partial.cacheableTasks
  );
  // Nạp muộn: chỉ khi thật sự thiếu cổng mới kéo env/Gemini/Prisma thật vào.
  const d = needDefaults
    ? (await import("./ai.service.defaults")).getDefaultAiDeps()
    : undefined;

  return {
    provider: partial.provider ?? d!.provider,
    cache: partial.cache ?? d!.cache,
    counter: partial.counter ?? d!.counter,
    logger: partial.logger ?? d!.logger,
    model: partial.model ?? d!.model,
    cacheableTasks: partial.cacheableTasks ?? d!.cacheableTasks,
    limits: partial.limits ?? d!.limits,
    now: partial.now ?? (() => new Date()),
  };
}

/**
 * Chạy 1 lượt AI theo luồng 4 bước (xem đầu file).
 *
 * @throws AIQuotaExceededError  hết lượt/ngày (HTTP 429, code AI_QUOTA_EXCEEDED)
 * @throws AIInvalidFormatError  AI trả sai định dạng sau khi thử lại (T8, nguyên vẹn)
 * @throws AIServiceError        429/timeout/mạng/lỗi khác từ lớp bao (T8, nguyên vẹn)
 */
export async function runAiTask<S extends z.ZodTypeAny>(
  input: RunAiTaskInput<S>,
  deps: Partial<AiServiceDeps> = {}
): Promise<RunAiTaskResult<z.output<S>>> {
  // (0) task phải thuộc danh sách; sai thì dừng NGAY, chưa đụng cổng nào.
  const parsedTask = aiTaskSchema.safeParse(input.task);
  if (!parsedTask.success) {
    throw Object.assign(new Error("Loại việc AI không hợp lệ."), {
      code: AI_INVALID_TASK_CODE,
      statusCode: 400,
    });
  }
  const task = parsedTask.data;
  const { userId, role, prompt, schema } = input;

   const { provider, cache, counter, logger, limits, model, cacheableTasks, now } = await resolveDeps(deps);

  /** Ghi đúng 1 dòng log; log lỗi thì chỉ báo mã, không làm hỏng kết quả. */
  const writeLog = async (status: AiUsageStatus, tokens: number | null = null) => {
    try {
      await logger.log({ userId, task, status, tokens });
    } catch (error) {
      console.error(`[ai/service] log_failed status=${status} code=${errorCode(error)}`);
    }
  };

  // (1) Giới hạn lượt/ngày. Hết lượt: không gọi model, không đụng cache.
  const limit = dailyLimitForRole(role, limits);
  const used = await counter.countUsedToday(userId, now());
  if (used >= limit) {
    await writeLog("rate_limited");
    throw new AIQuotaExceededError();
  }

   // (2) Tra cache, chỉ với task cache được. Khóa = hash(task + model + prompt đã chuẩn hóa),
  //     không phải prompt thô. `key` là undefined nghĩa là task này không dùng cache.
  const key = cacheableTasks.has(task) ? buildAiCacheKey(task, model, prompt) : undefined;
  if (key !== undefined) {
    let hit: unknown;
    try {
      hit = await cache.get(key);
    } catch (error) {
      console.error(`[ai/service] cache_get_failed code=${errorCode(error)}`);
    }
    if (hit !== undefined) {
      // Kiểm lại bằng schema của lượt này: cùng task+prompt nhưng khác khuôn thì coi là không trúng.
      const again = schema.safeParse(hit);
      if (again.success) {
        await writeLog("cached");
        return { data: again.data as z.output<S>, cached: true };
      }
    }
  }
  // (3) Gọi AI. Lỗi: log rồi ném lại NGUYÊN VẸN (không bọc, không đổi message).
  let result: Awaited<ReturnType<typeof generateJson<S>>>;
  try {
    result = await generateJson(provider, prompt, schema, { schemaName: task });
  } catch (error) {
    const gemini429 = error instanceof AIServiceError && error.code === "RATE_LIMITED";
    await writeLog(gemini429 ? "rate_limited" : "error");
    throw error;
  }

  // (4) Chỉ tới đây (đã qua Zod) mới lưu cache (nếu task cache được) + log ok.
  if (key !== undefined) {
    try {
      await cache.set(key, result.data);
    } catch (error) {
      console.error(`[ai/service] cache_set_failed code=${errorCode(error)}`);
    }
  }
  await writeLog("ok", sumTokens(result.tokens));

  return { data: result.data, cached: false };
}