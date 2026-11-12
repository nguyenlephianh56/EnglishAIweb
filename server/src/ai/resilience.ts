// =====================================================================
// ai/resilience.ts — Xử lý lỗi HẠ TẦNG khi gọi AI: 429, timeout, lỗi mạng.
//
// (Bước 2: mới có phần MÃ LỖI + lớp lỗi AIServiceError. Phần lớp bao
//  withResilience sẽ thêm ở các bước sau.)
//
// Lỗi hạ tầng KHÁC lỗi định dạng (AI_INVALID_FORMAT ở json.ts):
//   - Lỗi hạ tầng: AI không trả lời được (hết lượt, quá lâu, mất mạng...).
//   - Lỗi định dạng: AI trả lời nhưng sai khuôn JSON.
//
// Bảo mật: lỗi KHÔNG có `cause`, message cố định tiếng Việt, không chứa key/URL/
// prompt/phản hồi thô. T9 chỉ cần đọc `code` để ghi ai_usage_logs.
// =====================================================================
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";
/** Mã lỗi ổn định để T9 ghi log và FE hiển thị. */
export type AIServiceErrorCode =
  | "RATE_LIMITED" // hết hạn mức (429), đã thử lại vẫn bị
  | "TIMEOUT" // AI trả lời quá lâu
  | "AI_UNAVAILABLE" // lỗi mạng, đã thử lại vẫn lỗi
  | "AI_ERROR"; // lỗi khác (key sai, 400, 5xx...), không thử lại

/** Mã HTTP + câu thông báo thân thiện cho từng mã lỗi. */
export const AI_SERVICE_ERRORS: Record<
  AIServiceErrorCode,
  { statusCode: number; message: string }
> = {
  RATE_LIMITED: {
    statusCode: 429,
    message: "AI đang quá tải lượt gọi. Bạn vui lòng thử lại sau ít phút.",
  },
  TIMEOUT: {
    statusCode: 504,
    message: "AI phản hồi quá lâu. Bạn vui lòng thử lại.",
  },
  AI_UNAVAILABLE: {
    statusCode: 502,
    message: "Không kết nối được dịch vụ AI. Bạn vui lòng kiểm tra mạng và thử lại sau.",
  },
  AI_ERROR: {
    statusCode: 502,
    message: "Dịch vụ AI đang gặp sự cố. Bạn vui lòng thử lại sau.",
  },
};

/**
 * Lỗi chuẩn khi gọi AI thất bại vì lý do hạ tầng.
 * Cùng khuôn với AIInvalidFormatError (có `code` + `statusCode`).
 */
export class AIServiceError extends Error {
  readonly code: AIServiceErrorCode;
  readonly statusCode: number;
  /** Tổng số lần đã gọi provider (kể cả lần đầu). */
  readonly attempts: number;
  /** Gợi ý chờ bao lâu rồi thử lại (ms), thường có khi RATE_LIMITED. */
  readonly retryAfterMs?: number;

  constructor(
    code: AIServiceErrorCode,
    attempts: number,
    options?: { retryAfterMs?: number }
  ) {
    super(AI_SERVICE_ERRORS[code].message);
    this.name = "AIServiceError";
    this.code = code;
    this.statusCode = AI_SERVICE_ERRORS[code].statusCode;
    this.attempts = attempts;
    this.retryAfterMs = options?.retryAfterMs;
  }
}
// ---------------------------------------------------------------------
// Lớp bao withResilience
// ---------------------------------------------------------------------

/**
 * Trần thời gian chờ khi AI gợi ý "hãy chờ X giây" (Retry-After).
 * Nếu AI bảo chờ LÂU HƠN trần này thì không chờ-rồi-thử-lại (thử sớm chỉ bị 429 tiếp
 * và tốn lượt) mà báo RATE_LIMITED ngay.
 */
export const MAX_RETRY_AFTER_MS = 10_000;

/** Cấu hình cho withResilience. Giá trị thật lấy từ .env (xem resilience.config.ts). */
export interface ResilienceOptions {
  /** Số lần thử lại thêm khi gặp 429 (0 = không thử lại). */
  retry429Max: number;
  /** Thời gian chờ mặc định (ms) khi AI không gợi ý thời gian chờ. */
  retry429DelayMs: number;
  /** Số lần thử lại thêm khi lỗi mạng (0 = không thử lại). */
  retryNetworkMax: number;
  /** Thời gian chờ (ms) trước khi thử lại lỗi mạng. */
  retryNetworkDelayMs: number;
  /**
   * Hàm chờ. Mặc định dùng setTimeout thật; test truyền hàm giả để không phải chờ.
   */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Bọc một AIProvider để xử lý lỗi hạ tầng. Provider bên trong không cần sửa.
 *
 * Bảng quyết định (theo `kind` của AIProviderError):
 *  - RATE_LIMITED (429): chờ rồi thử lại tối đa `retry429Max` lần. Chờ = gợi ý của AI nếu có,
 *    không thì `retry429DelayMs`, tối đa trần 10 giây. Hết lượt, hoặc AI bảo chờ quá trần
 *    -> AIServiceError("RATE_LIMITED").
 *  - TIMEOUT: KHÔNG thử lại (khỏi bắt học sinh chờ lâu và tốn lượt) -> "TIMEOUT".
 *  - NETWORK: thử lại tối đa `retryNetworkMax` lần sau `retryNetworkDelayMs`;
 *    hết lượt -> "AI_UNAVAILABLE".
 *  - AUTH / UNKNOWN (key sai, 400, 5xx...): KHÔNG thử lại -> "AI_ERROR" (thông báo chung).
 *  - INVALID_RESPONSE (AI trả rỗng/bị chặn): ném lại nguyên vẹn, không đổi hành vi cũ.
 *  - Thứ gì không phải AIProviderError (provider viết sai hợp đồng): "AI_ERROR", không lộ chi tiết.
 *
 * Lỗi hạ tầng không đi vào retry định dạng của generateJson: generateJson không bắt
 * lỗi provider, nên AIServiceError đi thẳng ra ngoài.
 *
 * Log chỉ có: tên provider, mã lỗi, số lần thử, thời gian chờ. Không log nội dung nào khác.
 */
export function withResilience(
  provider: AIProvider,
  options: ResilienceOptions
): AIProvider {
  const sleep = options.sleep ?? realSleep;

  /** Ghi log (chỉ mã + số lần) rồi tạo lỗi chuẩn để ném ra. */
  const fail = (
    code: AIServiceErrorCode,
    attempts: number,
    retryAfterMs?: number
  ): AIServiceError => {
    console.warn(
      `[ai/resilience] provider=${provider.name} code=${code} attempts=${attempts} giveUp=true`
    );
    return new AIServiceError(
      code,
      attempts,
      retryAfterMs !== undefined ? { retryAfterMs } : undefined
    );
  };

  const waitBeforeRetry = async (
    code: "RATE_LIMITED" | "NETWORK",
    attempts: number,
    waitMs: number
  ) => {
    console.warn(
      `[ai/resilience] provider=${provider.name} code=${code} attempts=${attempts} waitMs=${waitMs}`
    );
    await sleep(waitMs);
  };

  return {
    name: provider.name,

    async generate(req: AIRequest): Promise<AIResponse> {
      // Đếm riêng từng loại lỗi: mỗi loại có "ngân sách" thử lại của nó.
      let rateLimitRetries = 0;
      let networkRetries = 0;

      for (let attempt = 1; ; attempt++) {
        try {
          return await provider.generate(req);
        } catch (error: unknown) {
          // Đã là lỗi chuẩn (vd bị bọc nhiều lớp): giữ nguyên.
          if (error instanceof AIServiceError) throw error;

          // Provider đúng hợp đồng chỉ ném AIProviderError. Thứ khác là lỗi lạ.
          if (!(error instanceof AIProviderError)) throw fail("AI_ERROR", attempt);

          switch (error.kind) {
            case "RATE_LIMITED": {
              const suggested = error.retryAfterMs;
              if (
                rateLimitRetries >= options.retry429Max ||
                (suggested !== undefined && suggested > MAX_RETRY_AFTER_MS)
              ) {
                throw fail("RATE_LIMITED", attempt, suggested);
              }
              // Ưu tiên gợi ý của AI; không có thì dùng mặc định (đã chặn bởi trần).
              const waitMs =
                suggested ?? Math.min(options.retry429DelayMs, MAX_RETRY_AFTER_MS);
              rateLimitRetries++;
              await waitBeforeRetry("RATE_LIMITED", attempt, waitMs);
              break;
            }

            case "NETWORK": {
              if (networkRetries >= options.retryNetworkMax) {
                throw fail("AI_UNAVAILABLE", attempt);
              }
              const waitMs = Math.min(options.retryNetworkDelayMs, MAX_RETRY_AFTER_MS);
              networkRetries++;
              await waitBeforeRetry("NETWORK", attempt, waitMs);
              break;
            }

            case "TIMEOUT":
              throw fail("TIMEOUT", attempt);

            case "INVALID_RESPONSE":
              throw error;

            default: // AUTH, UNKNOWN
              throw fail("AI_ERROR", attempt);
          }
        }
      }
    },
  };
}