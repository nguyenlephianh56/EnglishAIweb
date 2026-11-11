// =====================================================================
// ai/provider.ts — "Hợp đồng" chung cho mọi nhà cung cấp AI.
//
// File này CHỈ chứa kiểu dữ liệu + interface, KHÔNG gọi API thật, KHÔNG có logic.
// Lớp trên (ai.service.ts: cache, giới hạn lượt, kiểm Zod...) chỉ import từ file này,
// nên không biết (và không cần biết) bên dưới là Gemini, provider giả (mock) hay thứ khác.
// Muốn đổi nhà cung cấp AI sau này: viết 1 class mới implements AIProvider, không sửa lớp trên.
// =====================================================================

/**
 * Yêu cầu gửi cho AI (đầu vào của `generate`).
 */
export interface AIRequest {
  /** Nội dung chính gửi cho AI (đề bài, bài viết của học sinh...). */
  prompt: string;

  /** Chỉ dẫn vai trò/cách trả lời, ví dụ "Bạn là giáo viên tiếng Anh". Không bắt buộc. */
  system?: string;

  /**
   * true = bắt AI trả về JSON hợp lệ (provider sẽ bật chế độ JSON của API).
   * Lớp trên vẫn phải kiểm kết quả bằng Zod, vì AI vẫn có thể trả sai khuôn.
   */
  json?: boolean;

  /** Độ "sáng tạo" của AI. Thấp (0-0.3) = ổn định, hợp để chấm bài; cao = đa dạng, hợp để sinh bài. */
  temperature?: number;

  /** Giới hạn độ dài câu trả lời (tính theo token) để tiết kiệm lượt/chi phí. */
  maxOutputTokens?: number;

  /**
   * File âm thanh gửi kèm (dành cho chữ hóa bài Nói ở T18).
   * `mimeType` là loại file (ví dụ "audio/webm"), `data` là nội dung file dạng Buffer.
   */
  audio?: { mimeType: string; data: Buffer };
}

/**
 * Kết quả AI trả về (đầu ra của `generate`).
 */
export interface AIResponse {
  /** Văn bản AI trả lời. Nếu request có `json: true` thì đây là chuỗi JSON (lớp trên tự JSON.parse + kiểm Zod). */
  text: string;

  /** Số token đã dùng (nếu nhà cung cấp báo). Dùng để ghi vào `ai_usage_logs`. */
  tokens?: { input?: number; output?: number };

  /** Tên model thực sự đã trả lời (ví dụ tên model Flash lấy từ .env). */
  model: string;
}

/**
 * Các loại lỗi khi gọi AI. Lớp trên dựa vào đây để quyết định xử lý:
 * - RATE_LIMITED: bị giới hạn lượt (HTTP 429) → chờ rồi thử lại, hoặc báo "thử lại sau".
 * - TIMEOUT: AI trả lời quá lâu.
 * - NETWORK: lỗi mạng, không kết nối được.
 * - INVALID_RESPONSE: AI trả về thứ không dùng được (rỗng, bị chặn, không phải JSON...).
 * - AUTH: sai/thiếu API key hoặc không có quyền (lỗi cấu hình, không phải lỗi của học sinh).
 * - UNKNOWN: lỗi khác chưa phân loại được.
 */
export type AIErrorKind =
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "AUTH"
  | "UNKNOWN";

/**
 * Lỗi chuẩn của lớp AI. Mọi provider khi gặp sự cố đều `throw new AIProviderError(...)`,
 * để lớp trên chỉ cần bắt một loại lỗi duy nhất.
 *
 * Cố ý KHÔNG kế thừa AppError của dự án (dự án chưa có) và không phụ thuộc Express:
 * khi cần trả HTTP, ai.service.ts sẽ đổi `kind` thành mã HTTP + `failure(...)`.
 */
export class AIProviderError extends Error {
  /** Loại lỗi (xem AIErrorKind). */
  readonly kind: AIErrorKind;

  /** Nên chờ bao nhiêu mili-giây rồi thử lại (thường có khi RATE_LIMITED). Không biết thì để trống. */
  readonly retryAfterMs?: number;

  /**
   * @param kind Loại lỗi.
   * @param message Câu tiếng Việt thân thiện, có thể hiện cho người dùng.
   *                TUYỆT ĐỐI không chứa API key, URL hay chi tiết nội bộ.
   * @param options.retryAfterMs Gợi ý thời gian chờ trước khi thử lại.
   * @param options.cause Lỗi gốc từ thư viện/API (chỉ để dev gỡ lỗi nội bộ;
   *                      không đưa vào response, vì có thể chứa URL hoặc key).
   */
  constructor(
    kind: AIErrorKind,
    message: string,
    options?: { retryAfterMs?: number; cause?: unknown }
  ) {
    // Truyền cause cho Error gốc: Node lưu nó ở dạng "không liệt kê",
    // nên JSON.stringify(err) sẽ không vô tình in lỗi gốc ra ngoài.
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AIProviderError";
    this.kind = kind;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

/**
 * Giao diện mà mọi nhà cung cấp AI phải tuân theo (Gemini, mock dùng khi test...).
 */
export interface AIProvider {
  /** Tên nhà cung cấp để ghi log, ví dụ "gemini" hoặc "mock". Không chứa bí mật. */
  readonly name: string;

  /**
   * Gửi yêu cầu cho AI và chờ kết quả.
   * Thành công → trả AIResponse. Thất bại → throw AIProviderError (không throw loại lỗi khác).
   */
  generate(req: AIRequest): Promise<AIResponse>;
}