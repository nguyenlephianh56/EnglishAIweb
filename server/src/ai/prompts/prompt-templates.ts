// =====================================================================
// ai/prompts/prompt-templates.ts — Lấy mẫu prompt theo key + dựng prompt hoàn chỉnh (T10, bước 2).
//
//   getPromptTemplate(key) : lấy mẫu từ bảng prompt_templates; chưa có bản ghi -> dùng mặc định.
//   buildPrompt(key, vars) : lấy mẫu + bọc nội dung người dùng vào thẻ + điền biến.
//
// Quy tắc:
//   - Key lạ (không có trong defaults.ts)  -> PROMPT_NOT_FOUND (không hỏi DB).
//   - Bản ghi DB hỏng (biến lạ / thiếu biến bắt buộc) -> PROMPT_INVALID_TEMPLATE.
//     KHÔNG tự rơi về mặc định, để admin biết mà sửa.
//   - Chỉ rơi về mặc định khi DB KHÔNG có bản ghi cho key.
//   - Lỗi DB (mất kết nối...) được ném tiếp, không che bằng mặc định.
//   - Không log mẫu hay nội dung người dùng; message lỗi chỉ chứa key và tên biến.
// =====================================================================

import { prisma } from "../../config/prisma";
import { getPromptDefinition, type PromptDefinition } from "./defaults";
import {
  PROMPT_INVALID_TEMPLATE_CODE,
  PROMPT_NOT_FOUND_CODE,
  PromptError,
  extractVariables,
  renderPrompt,
  wrapUserText,
  type PromptVariables,
} from "./render";

/** Kiểu "DB tối thiểu" để test bằng DB giả (PrismaClient thật gán vào được). */
export interface PromptTemplateDb {
  promptTemplate: {
    findUnique(args: { where: { key: string } }): Promise<{ template: string } | null>;
  };
}

function requireDefinition(key: string): PromptDefinition {
  const definition = getPromptDefinition(key);
  if (!definition) {
    throw new PromptError(PROMPT_NOT_FOUND_CODE, `Không có mẫu prompt với key "${safeKey(key)}".`);
  }
  return definition;
}

/** Cắt ngắn key trong message lỗi (key do code truyền vào, nhưng đề phòng giá trị lạ). */
function safeKey(key: string): string {
  return String(key).slice(0, 60);
}

/**
 * Kiểm một mẫu có khớp định nghĩa không: không dùng biến ngoài whitelist,
 * và có đủ biến bắt buộc. Ném PROMPT_INVALID_TEMPLATE nếu sai (message chỉ nêu TÊN biến).
 */
export function validateTemplate(definition: PromptDefinition, template: string): void {
  const used = extractVariables(template);
  const unknown = used.filter((name) => !definition.variables.includes(name));
  const absent = definition.required.filter((name) => !used.includes(name));

  if (unknown.length === 0 && absent.length === 0) return;

  const parts: string[] = [];
  if (unknown.length > 0) parts.push(`dùng biến không được phép: ${unknown.join(", ")}`);
  if (absent.length > 0) parts.push(`thiếu biến bắt buộc: ${absent.join(", ")}`);
  throw new PromptError(
    PROMPT_INVALID_TEMPLATE_CODE,
    `Mẫu prompt "${definition.key}" không hợp lệ — ${parts.join("; ")}.`,
    [...unknown, ...absent]
  );
}

/**
 * Lấy mẫu prompt theo key.
 * DB có bản ghi -> kiểm hợp lệ rồi dùng bản DB. DB chưa có -> dùng bản mặc định trong code.
 */
export async function getPromptTemplate(
  key: string,
  db: PromptTemplateDb = prisma
): Promise<string> {
  const definition = requireDefinition(key);

  const row = await db.promptTemplate.findUnique({ where: { key: definition.key } });
  if (!row) return definition.template;

  validateTemplate(definition, row.template);
  return row.template;
}

/**
 * Dựng prompt hoàn chỉnh cho key:
 *  1. lấy mẫu (DB hoặc mặc định);
 *  2. bọc các biến "không tin cậy" (bài viết, chủ đề...) vào thẻ phân định — làm ở CODE
 *     nên admin sửa mẫu trong DB cũng không gỡ được lớp bảo vệ;
 *  3. điền biến (thiếu -> PROMPT_MISSING_VARIABLE, thừa -> bỏ qua).
 *
 * Giá trị các biến còn lại (level, type, count, minWords...) KHÔNG được lọc ở đây:
 * T11/T13 phải kiểm bằng Zod trước khi truyền vào.
 */
export async function buildPrompt(
  key: string,
  variables: PromptVariables,
  db: PromptTemplateDb = prisma
): Promise<string> {
  const definition = requireDefinition(key);
  const template = await getPromptTemplate(definition.key, db);

  const prepared: Record<string, string | number | undefined> = { ...variables };
  for (const [name, tag] of Object.entries(definition.untrusted)) {
    const value = variables[name];
    if (value !== undefined && value !== null) {
      prepared[name] = wrapUserText(tag, String(value));
    }
  }

  return renderPrompt(template, prepared);
}