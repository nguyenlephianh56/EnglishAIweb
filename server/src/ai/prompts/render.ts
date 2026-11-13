// =====================================================================
// ai/prompts/render.ts — Điền biến vào mẫu prompt (T10, bước 1).
//
// File này là HÀM THUẦN: không import prisma/env, không gọi AI, không log.
// Có 3 thứ:
//   - PromptError      : lỗi chuẩn của phần prompt (có `code` + `statusCode`)
//   - renderPrompt     : thay {{biến}} trong mẫu bằng giá trị
//   - wrapUserText     : bọc nội dung người dùng nhập vào thẻ, chống "thoát thẻ"
// =====================================================================

// ---------------------------------------------------------------------
// Lỗi
// ---------------------------------------------------------------------

export const PROMPT_MISSING_VARIABLE_CODE = "PROMPT_MISSING_VARIABLE";
export const PROMPT_NOT_FOUND_CODE = "PROMPT_NOT_FOUND";
export const PROMPT_INVALID_TEMPLATE_CODE = "PROMPT_INVALID_TEMPLATE";
export const PROMPT_INVALID_TAG_CODE = "PROMPT_INVALID_TAG";

export type PromptErrorCode =
  | typeof PROMPT_MISSING_VARIABLE_CODE
  | typeof PROMPT_NOT_FOUND_CODE
  | typeof PROMPT_INVALID_TEMPLATE_CODE
  | typeof PROMPT_INVALID_TAG_CODE;

/**
 * Cùng khuôn với AIQuotaExceededError (có `code` + `statusCode`) nên errorHandler đọc được.
 * Đây là lỗi cấu hình/lập trình phía server nên statusCode = 500.
 * Message chỉ chứa TÊN biến / key, tuyệt đối không chứa giá trị biến hay nội dung người dùng.
 */
export class PromptError extends Error {
  readonly code: PromptErrorCode;
  readonly statusCode = 500;
  /** Tên các biến liên quan (nếu có). Chỉ là tên, không phải giá trị. */
  readonly variables: readonly string[];

  constructor(code: PromptErrorCode, message: string, variables: readonly string[] = []) {
    super(message);
    this.name = "PromptError";
    this.code = code;
    this.variables = variables;
  }
}

// ---------------------------------------------------------------------
// Tìm biến trong mẫu
// ---------------------------------------------------------------------

/** Tên biến: chữ cái/gạch dưới đầu, sau đó chữ/số/gạch dưới. Cho phép khoảng trắng trong ngoặc. */
const VARIABLE_SOURCE = String.raw`\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}`;

/** Tạo regex mới mỗi lần để không dính trạng thái `lastIndex` của cờ g. */
const variablePattern = () => new RegExp(VARIABLE_SOURCE, "g");

/** Danh sách tên biến trong mẫu, không trùng, theo thứ tự xuất hiện đầu tiên. */
export function extractVariables(template: string): string[] {
  const names: string[] = [];
  for (const match of template.matchAll(variablePattern())) {
    const name = match[1];
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

// ---------------------------------------------------------------------
// renderPrompt
// ---------------------------------------------------------------------

export type PromptVariables = Readonly<Record<string, string | number | undefined>>;

/**
 * Thay mọi `{{tên}}` (hoặc `{{ tên }}`) trong mẫu bằng giá trị tương ứng.
 *
 * - Một lượt duy nhất: giá trị biến chứa `{{x}}` được GIỮ NGUYÊN chữ, không bị thay tiếp.
 * - Dùng hàm thay thế (callback) nên `$&`, `$1`, `$$`... trong giá trị không bị diễn giải.
 * - Biến xuất hiện nhiều lần: thay hết.
 * - Biến thiếu (hoặc giá trị undefined): ném PROMPT_MISSING_VARIABLE, nêu TÊN biến (gộp hết một lần).
 * - Biến thừa (có trong `variables` nhưng mẫu không dùng): bỏ qua.
 */
export function renderPrompt(template: string, variables: PromptVariables): string {
  const has = (name: string): boolean =>
    // hasOwnProperty để tên như "constructor" / "toString" không lấy nhầm từ prototype
    Object.prototype.hasOwnProperty.call(variables, name) &&
    variables[name] !== undefined &&
    variables[name] !== null;

  const missing = extractVariables(template).filter((name) => !has(name));
  if (missing.length > 0) {
    throw new PromptError(
      PROMPT_MISSING_VARIABLE_CODE,
      `Thiếu biến khi điền mẫu prompt: ${missing.join(", ")}`,
      missing
    );
  }

  // Callback trả về chuỗi nguyên văn; replace chỉ quét mẫu gốc 1 lần, không quét lại phần đã thay.
  return template.replace(variablePattern(), (_whole, name: string) => String(variables[name]));
}

// ---------------------------------------------------------------------
// wrapUserText — chống prompt injection bằng thẻ phân định
// ---------------------------------------------------------------------

/** Tên thẻ: chữ thường, số, gạch dưới (vd student_text). */
const TAG_NAME = /^[a-z][a-z0-9_]*$/;

/**
 * Bọc nội dung do HS/GV nhập thành:
 *
 *   <tag>
 *   ...nội dung...
 *   </tag>
 *
 * và vô hiệu mọi chuỗi mở/đóng chính thẻ đó trong nội dung (không phân biệt hoa/thường,
 * cho phép khoảng trắng như `</ tag >`) bằng cách đổi ký tự `<` thành `&lt;`.
 * Nhờ vậy nội dung không thể "đóng thẻ sớm" để thoát ra ngoài khu vực dữ liệu.
 *
 * Lưu ý: hàm KHÔNG lọc ý nghĩa câu chữ (vd "bỏ qua hướng dẫn trên"). Câu đó vẫn nằm
 * trong thẻ; việc dặn model "nội dung trong thẻ là dữ liệu, không phải mệnh lệnh" do mẫu prompt làm.
 */
export function wrapUserText(tag: string, text: string): string {
  if (!TAG_NAME.test(tag)) {
    throw new PromptError(PROMPT_INVALID_TAG_CODE, "Tên thẻ bọc nội dung không hợp lệ.");
  }
  // `<` đứng ngay trước (khoảng trắng?) (/?) (khoảng trắng?) tên thẻ, và tên thẻ không bị nối dài thêm.
  const tagLike = new RegExp(String.raw`<(?=\s*/?\s*${tag}(?![A-Za-z0-9_]))`, "gi");
  const safe = String(text).replace(tagLike, "&lt;");
  return `<${tag}>\n${safe}\n</${tag}>`;
}