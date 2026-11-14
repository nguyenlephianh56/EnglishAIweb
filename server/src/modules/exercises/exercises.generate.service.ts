import type { Role } from "@prisma/client";
import { runAiTask } from "../../ai/ai.service";
import type { AiServiceDeps } from "../../ai/ai.service";
import { buildExerciseShape } from "../../ai/prompts/exercise-shape";
import { buildPrompt } from "../../ai/prompts/prompt-templates";
import type { PromptTemplateDb } from "../../ai/prompts/prompt-templates";
import { buildGeneratedExerciseSchema } from "./exercises.generate.output.schema";
import type { GeneratedExerciseDraft } from "./exercises.generate.output.schema";
import type { GenerateExerciseInput } from "./exercises.generate.schema";

export class GenerateExerciseNotImplementedError extends Error {
  readonly code = "NOT_IMPLEMENTED";
  readonly statusCode = 501;

  constructor() {
    super("Chức năng sinh bài bằng AI chưa được triển khai");
    this.name = "GenerateExerciseNotImplementedError";
  }
}

/** Stub T11: chỉ nhận user từ token và body đã được route kiểm tra. */
export async function generateExercise(
  _user: { id: number; role: Role },
  _input: GenerateExerciseInput
): Promise<never> {
  // TODO(T11): Dùng T10 dựng prompt key exercise_generate với skill, level, topic,
  // type, count, exercise_shape; nối runAiTask với userId/role từ _user.

  // TODO(T11): Kiểm kết quả bằng validateExercise (T1); sai thì thử lại 1 lần.
  // Phối hợp với retry của lớp AI hiện có để không thử lại nhiều lần ngoài ý muốn.

  // TODO(T11): Lưu bài qua Prisma: createdById = _user.id, source = "AI",
  // status = "DRAFT", inLibrary = false. Không nhận các field này từ client.

  throw new GenerateExerciseNotImplementedError();
}

/** Đầu vào đã được route kiểm + userId/role do server lấy từ token (không nhận từ client). */
export interface GenerateExerciseDraftInput extends GenerateExerciseInput {
  userId: number;
  /** Cần để lớp AI chọn mức giới hạn lượt/ngày (HS khác GV). */
  role: Role;
}

/**
 * T11: nhờ AI sinh MỘT bài nháp và trả về object bài ĐÃ HỢP LỆ. CHƯA lưu DB.
 *
 * Các bước:
 *   1. dựng prompt từ mẫu T10 (key exercise_generate) + khuôn của dạng bài;
 *   2. gọi runAiTask (task "generate": kiểm lượt/ngày, không cache, ghi 1 dòng ai_usage_logs);
 *   3. kết quả đi qua schema đầu ra (validateExercise + khớp type/skill/level/count).
 *      Sai thì generateJson (T8) thử lại đúng 1 lần, tức tối đa 2 lần gọi model.
 *
 * @throws AIQuotaExceededError  hết lượt/ngày (429), model không được gọi
 * @throws AIInvalidFormatError  sau 2 lần vẫn sai khuôn (AI_INVALID_FORMAT, 502)
 * Không log prompt, nội dung bài hay phản hồi thô.
 */
export async function generateExerciseDraft(
  input: GenerateExerciseDraftInput,
  deps: Partial<AiServiceDeps> = {},
  promptDb?: PromptTemplateDb
): Promise<GeneratedExerciseDraft> {
  const { userId, role, skill, level, topic, type, count } = input;

  const prompt = await buildPrompt(
    "exercise_generate",
    { skill, level, topic, type, count, exercise_shape: buildExerciseShape(type) },
    promptDb
  );

  const schema = buildGeneratedExerciseSchema({ type, skill, level, count });
  const result = await runAiTask({ userId, role, task: "generate", prompt, schema }, deps);
  return result.data;
}