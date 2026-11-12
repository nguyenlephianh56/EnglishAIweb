// =====================================================================
// ai/json.ts — Gọi AI và bắt buộc kết quả là JSON đúng khuôn (Zod).
//
// Quy trình của generateJson:
//   1) Gọi provider với json:true + dặn "chỉ trả JSON".
//   2) Bóc rào ```json ... ``` (nếu có) -> JSON.parse -> Zod safeParse.
//   3) Đúng -> trả dữ liệu đã parse. Sai -> thử lại ĐÚNG 1 LẦN (tối đa 2 lần gọi).
//   4) Vẫn sai -> ném AIInvalidFormatError (code AI_INVALID_FORMAT).
//
// Chỉ lỗi ĐỊNH DẠNG (JSON.parse lỗi / Zod không khớp) mới được thử lại.
// Lỗi của provider (AIProviderError: mạng, 429, timeout...) đi thẳng ra ngoài,
// việc xử lý chúng là việc con khác.
//
// Bảo mật: không log và không đưa vào lỗi/prompt retry bất kỳ nội dung thô nào
// (bài làm, phản hồi của model, giá trị sai). Chỉ có số lần thử, tên schema, mã lỗi.
// =====================================================================
import type { z } from "zod";
import type { AIProvider } from "./provider";

/** Mã lỗi khi AI trả sai định dạng sau khi đã thử lại. */
export const AI_INVALID_FORMAT_CODE = "AI_INVALID_FORMAT";
/** HTTP 502 (Bad Gateway): dịch vụ AI phía sau trả dữ liệu không dùng được. */
export const AI_INVALID_FORMAT_STATUS = 502;

/** Tổng số lần gọi provider tối đa = 1 lần đầu + 1 lần thử lại. */
const MAX_ATTEMPTS = 2;

/** Số lỗi Zod tối đa đưa vào câu nhắc ở lần thử lại. */
const MAX_HINT_ISSUES = 3;
/** Giới hạn độ dài đường dẫn field trong câu nhắc. */
const MAX_PATH_LENGTH = 60;

const JSON_ONLY_NOTE =
  "Chỉ trả về JSON hợp lệ, không dùng markdown (không rào ```), không giải thích thêm.";

/**
 * Lỗi chuẩn khi AI trả sai định dạng (đã thử lại vẫn sai).
 * Có `code` + `statusCode` giống mẫu lỗi nghiệp vụ của dự án,
 * nên controller hiện có (đọc statusCode + code) xử lý được ngay.
 * Cố ý KHÔNG có `cause`: tránh để lỗi Zod/chuỗi thô của model lọt ra ngoài.
 */
export class AIInvalidFormatError extends Error {
  readonly code = AI_INVALID_FORMAT_CODE;
  readonly statusCode = AI_INVALID_FORMAT_STATUS;
  /** Số lần đã gọi provider. */
  readonly attempts: number;
  /**
   * Tổng token của các lần đã gọi (chỉ để ghi ai_usage_logs). Thuộc tính KHÔNG
   * enumerable nên không lọt vào JSON.stringify / Object.keys / spread.
   * `declare`: không sinh trường enumerable rỗng khi không có token.
   */
  declare readonly tokens?: { input?: number; output?: number };

  constructor(attempts: number, tokens?: { input?: number; output?: number }) {
    super("AI trả về kết quả chưa đúng định dạng. Bạn vui lòng thử lại sau.");
    this.name = "AIInvalidFormatError";
    this.attempts = attempts;
    if (tokens) {
      Object.defineProperty(this, "tokens", {
        value: { ...tokens },
        enumerable: false,
        writable: false,
        configurable: false,
      });
    }
  }
}

/** Tùy chọn thêm khi gọi generateJson. */
export interface GenerateJsonOptions {
  /** Tên schema, chỉ để ghi log (vd "writing"). Mặc định "unnamed". */
  schemaName?: string;
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/** Kết quả thành công. `data` đã qua Zod; không có chuỗi thô. */
export interface GenerateJsonResult<T> {
  data: T;
  /** Số lần gọi provider (1 hoặc 2). */
  attempts: number;
  /** Model thực sự trả lời ở lần gọi cuối. */
  model: string;
  /** Tổng token của tất cả các lần gọi (nếu provider có báo). */
  tokens?: { input?: number; output?: number };
}

/** Bóc rào ```json ... ``` khi CẢ phản hồi được bọc trọn; không thì giữ nguyên. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

type ParseOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "json_parse" | "zod"; hint: string };

/**
 * Rút gọn lỗi Zod: chỉ lấy đường dẫn field + loại lỗi (+ kiểu mong đợi nếu là sai kiểu).
 * KHÔNG dùng `message`/`received` vì có thể chứa nguyên giá trị model trả (nội dung thô).
 */
function summarizeIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_HINT_ISSUES).map((issue) => {
    const path = issue.path.join(".").slice(0, MAX_PATH_LENGTH) || "(gốc)";
    const expected =
      issue.code === "invalid_type" ? `, cần kiểu ${issue.expected}` : "";
    return `${path}: ${issue.code}${expected}`;
  });
  return `không khớp khuôn (${issues.join("; ")})`;
}

function parseAndValidate<S extends z.ZodTypeAny>(
  text: string,
  schema: S
): ParseOutcome<z.output<S>> {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, reason: "json_parse", hint: "phản hồi không phải JSON hợp lệ" };
  }

  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data as z.output<S> };
  return { ok: false, reason: "zod", hint: summarizeIssues(result.error) };
}

function addTokens(
  total: { input?: number; output?: number } | undefined,
  more: { input?: number; output?: number } | undefined
): { input?: number; output?: number } | undefined {
  if (!more) return total;
  const sum = { ...(total ?? {}) };
  if (more.input !== undefined) sum.input = (sum.input ?? 0) + more.input;
  if (more.output !== undefined) sum.output = (sum.output ?? 0) + more.output;
  return sum;
}

/**
 * Gọi AI và trả về dữ liệu JSON đã được Zod kiểm.
 *
 * @throws AIInvalidFormatError nếu sau 2 lần gọi vẫn sai định dạng.
 * @throws AIProviderError (nguyên vẹn) nếu provider lỗi: không thử lại ở đây.
 */
export async function generateJson<S extends z.ZodTypeAny>(
  provider: AIProvider,
  prompt: string,
  schema: S,
  options: GenerateJsonOptions = {}
): Promise<GenerateJsonResult<z.output<S>>> {
  const schemaName = options.schemaName ?? "unnamed";
  const basePrompt = `${prompt}\n\n${JSON_ONLY_NOTE}`;
  let currentPrompt = basePrompt;
  let tokens: { input?: number; output?: number } | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Lỗi của provider không được bắt ở đây: để nguyên cho lớp trên.
    const response = await provider.generate({
      prompt: currentPrompt,
      json: true,
      ...(options.system !== undefined ? { system: options.system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxOutputTokens !== undefined
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
    });
    tokens = addTokens(tokens, response.tokens);

    const outcome = parseAndValidate(response.text, schema);
    if (outcome.ok) {
      return {
        data: outcome.data,
        attempts: attempt,
        model: response.model,
        ...(tokens ? { tokens } : {}),
      };
    }

    // Chỉ log: tên schema, số lần thử, lý do (loại lỗi). Không log nội dung.
    console.warn(
      `[ai/json] schema=${schemaName} attempt=${attempt}/${MAX_ATTEMPTS} reason=${outcome.reason}`
    );

    // Lần sau: prompt gốc + nhắc lỗi rút gọn, không kèm lại phản hồi sai.
    currentPrompt =
      `${basePrompt}\n\nLần trước phản hồi sai định dạng: ${outcome.hint}. ` +
      "Hãy trả lại đúng một JSON theo yêu cầu.";
  }

  console.warn(`[ai/json] schema=${schemaName} code=${AI_INVALID_FORMAT_CODE}`);
   throw new AIInvalidFormatError(MAX_ATTEMPTS, tokens);
}