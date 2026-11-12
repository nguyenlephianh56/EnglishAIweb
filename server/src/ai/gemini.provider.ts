import { GoogleGenAI, type Part } from "@google/genai";
import { env } from "../config/env";
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";

// Chỉ đọc các thuộc tính cần thiết của lỗi; không log/đưa lỗi gốc ra ngoài.
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function retryAfterMs(error: unknown): number | undefined {
  const source = asRecord(error);
  const headers = source.headers ?? asRecord(source.response).headers;
  const raw = headers instanceof Headers
    ? headers.get("retry-after")
    : asRecord(headers)["retry-after"] ?? asRecord(headers)["Retry-After"];

  if (typeof raw === "string" || typeof raw === "number") {
    const seconds = Number(raw);
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(String(raw)) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.ceil(ms);
  }

  // ApiError của SDK có thể chứa JSON lỗi Google trong message.
  // Chỉ lấy RetryInfo; tuyệt đối không dùng message đó làm thông báo trả ra.
  let body = source;
  if (typeof source.message === "string") {
    try {
      body = asRecord(JSON.parse(source.message));
    } catch {
      // Không phải JSON: tiếp tục kiểm details trên lỗi gốc.
    }
  }
  const details = asRecord(body.error).details ?? body.details ?? source.details;
  if (!Array.isArray(details)) return undefined;

  for (const item of details) {
    const detail = asRecord(item);
    if (detail["@type"] !== "type.googleapis.com/google.rpc.RetryInfo") continue;
    const delay = detail.retryDelay;
    if (typeof delay !== "string" || !/^\d+(\.\d+)?s$/.test(delay)) continue;
    const ms = Number(delay.slice(0, -1)) * 1000;
    if (Number.isFinite(ms)) return Math.ceil(ms);
  }
  return undefined;
}

function isNetworkError(error: unknown): boolean {
  let current: unknown = error;
  // Giới hạn số tầng để không lặp vô hạn nếu cause tham chiếu vòng.
  for (let depth = 0; depth < 5 && current; depth++) {
    const item = asRecord(current);
    const code = typeof item.code === "string" ? item.code : "";
    if (/^(ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EPIPE|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT)$/.test(code)) {
      return true;
    }
    if (typeof item.message === "string" &&
        /fetch failed|failed to fetch|network error|network request failed|socket hang up/i.test(item.message)) {
      return true;
    }
    current = item.cause;
  }
  return false;
}

function normalizeError(error: unknown, timedOut: boolean): AIProviderError {
  if (timedOut) {
    return new AIProviderError(
      "TIMEOUT",
      "AI phản hồi quá lâu. Bạn vui lòng thử lại.",
      { cause: error }
    );
  }
  if (error instanceof AIProviderError) return error;

  const status = asRecord(error).status;
  if (status === 429) {
    return new AIProviderError(
      "RATE_LIMITED",
      "AI đang giới hạn lượt gọi. Bạn vui lòng thử lại sau.",
      { retryAfterMs: retryAfterMs(error), cause: error }
    );
  }
  if (status === 401 || status === 403) {
    return new AIProviderError(
      "AUTH",
      "Không thể xác thực dịch vụ AI. Vui lòng kiểm tra cấu hình API key và quyền truy cập.",
      { cause: error }
    );
  }
  if (isNetworkError(error)) {
    return new AIProviderError(
      "NETWORK",
      "Không kết nối được dịch vụ AI. Bạn vui lòng kiểm tra mạng và thử lại.",
      { cause: error }
    );
  }
  return new AIProviderError(
    "UNKNOWN",
    "Dịch vụ AI gặp lỗi. Bạn vui lòng thử lại sau.",
    { cause: error }
  );
}

function containsSecret(value: string, key: string): boolean {
  return value.includes(key) || value.includes(encodeURIComponent(key)) ||
    /https?:\/\/\S*[?&](?:key|api_key|apikey|x-goog-api-key)=/i.test(value);
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini";

  async generate(req: AIRequest): Promise<AIResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      const key = env.GEMINI_API_KEY.trim();
      if (!key) {
        throw new AIProviderError(
          "AUTH",
          "Chưa cấu hình GEMINI_API_KEY để gọi dịch vụ AI."
        );
      }

      // Khởi tạo khi gọi: thiếu key không làm app/test lỗi lúc import.
      const client = new GoogleGenAI({ apiKey: key });
      const parts: Part[] = [{ text: req.prompt }];
      if (req.audio) {
        parts.push({
          inlineData: {
            mimeType: req.audio.mimeType,
            data: req.audio.data.toString("base64"),
          },
        });
      }

      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("AI request deadline exceeded"));
        }, env.AI_TIMEOUT_MS);
      });

      const config = {
        systemInstruction: req.system,
        temperature: req.temperature,
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: req.json ? "application/json" : undefined,
        abortSignal: controller.signal,
        httpOptions: { retryOptions: { attempts: 1 } },
        automaticContinuation: false,
      };

      // race bảo đảm hết thời gian ngay cả khi SDK/mock không xử lý abort.
      const response = await Promise.race([
        client.models.generateContent({
          model: env.GEMINI_MODEL,
          contents: [{ role: "user", parts }],
          config,
        }),
        timeout,
      ]);

      const candidate = response?.candidates?.[0];
      const blockReason = response?.promptFeedback?.blockReason;
      const blocked =
        blockReason && blockReason !== "BLOCKED_REASON_UNSPECIFIED";

      // Không trả kết quả bị cắt dở hoặc bị bộ lọc an toàn chặn.
      const unfinished =
        candidate?.finishReason && candidate.finishReason !== "STOP";

      const text = (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join("");

      if (blocked || unfinished || !text.trim()) {
        throw new AIProviderError(
          "INVALID_RESPONSE",
          "AI chưa trả về câu trả lời đầy đủ, hợp lệ hoặc nội dung đã bị chặn. Bạn vui lòng thử lại."
        );
      }

      // Ưu tiên phiên bản thực tế; nếu API không báo thì dùng model đã yêu cầu.
      const model = response.modelVersion?.trim() || env.GEMINI_MODEL;

      if (containsSecret(text, key) || containsSecret(model, key)) {
        throw new AIProviderError(
          "INVALID_RESPONSE",
          "Phản hồi AI chứa thông tin cấu hình không được phép trả ra."
        );
      }

            const usage = response.usageMetadata;
      const tokens: NonNullable<AIResponse["tokens"]> = {};
      if (usage?.promptTokenCount !== undefined) {
        tokens.input = usage.promptTokenCount;
      }
      const candidates = usage?.candidatesTokenCount;
      const thoughts = usage?.thoughtsTokenCount;
      if (candidates !== undefined || thoughts !== undefined) {
        tokens.output = (candidates ?? 0) + (thoughts ?? 0);
      }

      return {
        text,
        model,
        ...(Object.keys(tokens).length ? { tokens } : {}),
      };
    } catch (error: unknown) {
      throw normalizeError(error, timedOut);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}