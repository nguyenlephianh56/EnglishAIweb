// =====================================================================
// ai/writingGrader.ts — Chấm bài Viết bằng AI (T13, dòng "gọi AI").
//
//   gradeWriting(input, deps?) :
//     (1) kiểm tham số do SERVER truyền (level/minWords/...), vì level + minWords được điền
//         vào prompt NGUYÊN VĂN (không bọc thẻ) -> không để chuỗi lạ lọt vào prompt;
//     (2) dựng prompt từ mẫu `writing_grade` bằng buildPrompt (T10): `prompt` và `student_text`
//         được bọc thẻ phân định ở code, chống prompt injection;
//     (3) gọi runAiTask (T9) với task `grade_writing` + writingGradeResultSchema:
//         giới hạn lượt -> cache -> gọi model -> Zod (sai: retry 1 lần của T8) -> log.
//
// HÀM NÀY KHÔNG: lưu DB, tính điểm tổng, kiểm minWords/độ dài bài, bắt lỗi AI để giữ bài làm,
// tự retry thêm. Lỗi của T8/T9 (AI_INVALID_FORMAT, AI_QUOTA_EXCEEDED, AIServiceError...) được
// ném lại NGUYÊN VẸN để dòng sau của T13 xử lý.
// Không log text, prompt, phản hồi thô.
// =====================================================================
import { z } from "zod";
import { runAiTask } from "./ai.service";
import type { AiServiceDeps } from "./ai.service";
import type { AiRole } from "./ai.usage";
import { buildPrompt } from "./prompts/prompt-templates";
import type { PromptTemplateDb } from "./prompts/prompt-templates";
import { writingGradeResultSchema } from "./schemas/writing.schema";
import type { WritingGradeResult } from "./schemas/writing.schema";

/** Mã lỗi khi server truyền tham số sai (lỗi lập trình phía server, không phải lỗi HS). */
export const WRITING_GRADE_INVALID_INPUT_CODE = "WRITING_GRADE_INVALID_INPUT";

/** Message cố định, không chứa giá trị tham số hay nội dung bài viết. */
export class WritingGradeInputError extends Error {
  readonly code = WRITING_GRADE_INVALID_INPUT_CODE;
  readonly statusCode = 500;

  constructor() {
    super("Tham số chấm bài Viết không hợp lệ.");
    this.name = "WritingGradeInputError";
  }
}

export interface GradeWritingInput {
  /** Id người dùng, do server lấy từ token (không nhận từ client). */
  userId: number;
  /** Vai trò, do server lấy từ token; quyết định mức giới hạn lượt/ngày. */
  role: AiRole;
  /** Bài viết của học sinh (không kiểm độ dài ở đây). */
  text: string;
  /** Đề bài (exercise.content.prompt). */
  prompt: string;
  /** Số từ tối thiểu của đề (chỉ để báo cho AI; việc kiểm số từ là của dòng sau). */
  minWords: number;
  /** Cấp độ CEFR, vd "A2", "B1". */
  level: string;
}

/** Chỉ để test: tiêm cổng giả. Chạy thật thì bỏ trống. */
export interface GradeWritingDeps {
  ai?: Partial<AiServiceDeps>;
  promptDb?: PromptTemplateDb;
}

const inputSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["STUDENT", "TEACHER", "ADMIN"]),
  text: z.string(),
  prompt: z.string(),
  minWords: z.number().int().min(0).max(100000),
  // Một chữ cái + một chữ số (A1, A2, B1, B2, C1...). Chặn mọi chuỗi lạ chèn vào prompt.
  level: z.string().regex(/^[A-Z][0-9]$/),
});

/**
 * Chấm bài Viết, trả {criteria, comment, errors} ĐÃ qua Zod.
 *
 * @throws WritingGradeInputError  tham số server truyền sai (500)
 * @throws AIQuotaExceededError    hết lượt/ngày (429, AI_QUOTA_EXCEEDED)
 * @throws AIInvalidFormatError    sai khuôn sau tối đa 2 lần gọi (AI_INVALID_FORMAT)
 * @throws AIServiceError          429 Gemini/timeout/mạng (T8)
 * @throws PromptError             mẫu prompt thiếu/hỏng (500)
 */
export async function gradeWriting(
  input: GradeWritingInput,
  deps: GradeWritingDeps = {}
): Promise<WritingGradeResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new WritingGradeInputError();
  const { userId, role, text, prompt, minWords, level } = parsed.data;

  const fullPrompt = await buildPrompt(
    "writing_grade",
    { prompt, minWords, level, student_text: text },
    deps.promptDb
  );

  const result = await runAiTask(
    { userId, role, task: "grade_writing", prompt: fullPrompt, schema: writingGradeResultSchema },
    deps.ai
  );
  return result.data;
}