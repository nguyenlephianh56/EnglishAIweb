// =====================================================================
// learning-paths/learning-paths.path.ai.service.ts — Lộ trình học tuần bằng AI (T24, task `path`).
//
// AI chỉ CHỌN + SẮP THỨ TỰ trong danh sách ứng viên do server lọc bằng ĐÚNG luật bản không AI
// (recommendExercises: cùng LIBRARY_WHERE, cùng "HS chưa làm", cùng xếp kỹ năng) và viết `title` tiếng Việt.
// AI không bao giờ thấy/đưa id bài: nó chỉ trả `ref` (c1..cP), server tự ánh xạ ref -> bài thật.
//
// THỨ TỰ BẮT BUỘC (mỗi bước chặn trước khi tốn lượt AI hoặc ghi DB):
//   1. Tuần này đã có lộ trình -> trả luôn (200). KHÔNG gọi AI, không ghi log, không tốn lượt.
//   2. Lấy ứng viên (tối đa K bài/kỹ năng). Rỗng -> NoExercisesAvailableError (422). KHÔNG gọi AI.
//   3. Dựng đầu vào (hàm thuần) -> prompt -> runAiTask (T9: đếm lượt, cache, retry JSON, ghi ai_usage_logs).
//   4. Zod đầu ra lọc ref lạ/trùng, cắt N, làm sạch title.
//   5. Lưu bằng saveWeeklyPath (khóa + kiểm lại + tạo). AI chỉ được gọi Ở BƯỚC 3, tức TRƯỚC và NGOÀI transaction.
// Lỗi AI -> ném lỗi chuẩn hóa, KHÔNG tạo lộ trình và KHÔNG âm thầm chuyển sang luật (FE tự gọi POST /me nếu muốn).
//
// Hạn chế đã biết: hai request song song có thể CÙNG gọi AI (tốn 2 lượt); chỉ một lộ trình được tạo (khóa trong
// saveWeeklyPath), request thua nhận lộ trình thắng (200).
// Không log đầu vào AI, prompt, phản hồi thô, title do AI sinh, khóa; chỉ mã lỗi/trạng thái đi qua ai_usage_logs.
// =====================================================================
import { Role } from "@prisma/client";
import { logAiUsage } from "../../ai/ai.log";
import { runAiTask } from "../../ai/ai.service";
import { getDefaultAiDeps } from "../../ai/ai.service.defaults";
import { AIQuotaExceededError, type AiUsageLogger } from "../../ai/ai.types";
import { GeminiProvider } from "../../ai/gemini.provider";
import { AIInvalidFormatError } from "../../ai/json";
import { PATH_PROMPT_KEY, pathPromptVariables } from "../../ai/prompts/path.prompt";
import { buildPrompt } from "../../ai/prompts/prompt-templates";
import { AIProviderError } from "../../ai/provider";
import { AIServiceError, withResilience } from "../../ai/resilience";
import { createPathResultSchema } from "../../ai/schemas/path.schema";
import { env } from "../../config/env";
import { AI_CANDIDATE_LIMIT, AI_CANDIDATES_PER_SKILL } from "./learning-paths.constants";
import { buildPathAiInput, mapRefsToCandidates } from "./learning-paths.path.ai.input";
import {
  NoExercisesAvailableError,
  getCurrentPath,
  saveWeeklyPath,
  type PathItemInput,
} from "./learning-paths.path.service";
import { recommendExercises } from "./learning-paths.service";
import { getWeekStart } from "./learning-paths.week";
import type { LearningPathView } from "./learning-paths.view";

// Cùng tham số với T23: không tự thử lại 429/lỗi mạng ở tầng này (chỉ generateJson thử lại JSON sai).
const pathProvider = withResilience(new GeminiProvider(), {
  retry429Max: 0,
  retry429DelayMs: 0,
  retryNetworkMax: 0,
  retryNetworkDelayMs: 0,
});

/**
 * Tạo lộ trình tuần hiện tại bằng AI. `studentId` luôn lấy từ token. Trả `created: true` khi tạo mới (201),
 * `created: false` khi tuần này đã có lộ trình (200, gồm cả lộ trình do luật tạo).
 */
export const createCurrentPathWithAi = async (
  studentId: number,
  now?: Date,
  timeZone: string = env.APP_TIMEZONE
): Promise<{ created: boolean; path: LearningPathView }> => {
  // 1. Đã có lộ trình tuần này -> trả luôn, không gọi AI, không tốn lượt.
  const existing = await getCurrentPath(studentId, now ?? new Date(), timeZone);
  if (existing !== null) return { created: false, path: existing };

  // 2. Ứng viên bằng đúng luật bản không AI (chỉ khác: nhiều bài hơn mỗi kỹ năng). Rỗng -> 422, chưa tốn gì.
  const candidates = await recommendExercises(studentId, AI_CANDIDATE_LIMIT, AI_CANDIDATES_PER_SKILL);
  if (candidates.length === 0) throw new NoExercisesAvailableError();

  // 3. Đầu vào thuần + bảng ánh xạ ref -> bài thật (cùng chỉ số).
  const input = buildPathAiInput(candidates);
  const candidateByRef = mapRefsToCandidates(candidates);

  const ai = getDefaultAiDeps();
  let logAttempted = false;
  const logger: AiUsageLogger = {
    log(entry) {
      logAttempted = true;
      return ai.logger.log(entry);
    },
  };

  let chosen: { ref: string; title: string }[];
  try {
    const prompt = await buildPrompt(PATH_PROMPT_KEY, pathPromptVariables(input));
    const { data } = await runAiTask(
      {
        userId: studentId,
        role: Role.STUDENT,
        task: "path",
        prompt,
        schema: createPathResultSchema(input.items),
      },
      { ...ai, provider: pathProvider, logger }
    );
    chosen = data.items;
  } catch (error) {
    // Lỗi dựng prompt hoặc đếm lượt có thể xảy ra trước khi T9 ghi log -> vẫn đúng 1 dòng `error`.
    if (!logAttempted) {
      await logAiUsage(logger, { userId: studentId, task: "path", status: "error", tokens: null });
    }
    if (
      error instanceof AIQuotaExceededError ||
      error instanceof AIInvalidFormatError ||
      (error instanceof AIServiceError && error.code !== "AI_ERROR")
    ) {
      throw error;
    }
    if (error instanceof AIProviderError && error.kind === "INVALID_RESPONSE") {
      throw new AIInvalidFormatError(1);
    }
    throw new AIServiceError("AI_UNAVAILABLE", error instanceof AIServiceError ? error.attempts : 0);
  }

  // 4. Server tự ánh xạ ref -> id bài thật, giữ nguyên thứ tự AI sắp. (Zod đã bảo đảm ref hợp lệ; kiểm lại để an toàn.)
  const items: PathItemInput[] = [];
  for (const { ref, title } of chosen) {
    const candidate = candidateByRef.get(ref);
    if (candidate !== undefined) items.push({ title, exerciseId: candidate.exercise.id });
  }

  // 5. Lưu SAU khi AI đã trả xong, ngoài mọi transaction/khóa. Tuần tính lại lúc lưu (AI có thể chạy qua nửa đêm thứ Hai).
  return saveWeeklyPath(studentId, getWeekStart(now ?? new Date(), timeZone), items);
};