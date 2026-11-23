// =====================================================================
// attempts.suggest.service.ts — "Gợi ý nhận xét cho GV" (T27): soạn NHÁP, không lưu gì.
//
// Đúng khuôn runAnalysis của T23:
//   prepareSuggest (404/422, KHÔNG gọi AI) -> getDefaultAiDeps() -> buildPrompt -> runAiTask.
//   - logger bọc để lỗi xảy ra TRƯỚC khi T9 ghi log (dựng prompt, đếm lượt) vẫn ghi đúng 1 dòng `error`;
//   - provider bọc withResilience, không retry 429/mạng; chỉ lỗi ĐỊNH DẠNG được thử lại (trong generateJson,
//     tối đa 2 lần gọi) nên không có vòng retry nào ở đây;
//   - KHÔNG cache: task `suggest_comment` không nằm trong danh sách cache mặc định;
//   - KHÔNG aiRateLimit ở route (runAiTask đã đếm lượt, thêm nữa sẽ đếm hai lần).
// Chỉ ghi `ai_usage_logs` (qua T9); không đụng attempts, audit_logs, notifications, skill_profiles.
// Không log đầu vào, bài làm, nhận xét sinh ra, phản hồi thô, prompt đầy đủ, key.
// =====================================================================
import { logAiUsage } from "../../ai/ai.log";
import { runAiTask } from "../../ai/ai.service";
import { getDefaultAiDeps } from "../../ai/ai.service.defaults";
import { AIQuotaExceededError, type AiUsageLogger } from "../../ai/ai.types";
import { GeminiProvider } from "../../ai/gemini.provider";
import { AIInvalidFormatError } from "../../ai/json";
import { COMMENT_SUGGEST_PROMPT_KEY } from "../../ai/prompts/comment-suggest.prompt";
import { buildPrompt } from "../../ai/prompts/prompt-templates";
import { AIProviderError } from "../../ai/provider";
import { AIServiceError, withResilience } from "../../ai/resilience";
import { commentSuggestSchema } from "../../ai/schemas/comment-suggest.schema";
import { prepareSuggest } from "./attempts.suggest.prepare";

const suggestProvider = withResilience(new GeminiProvider(), {
  retry429Max: 0,
  retry429DelayMs: 0,
  retryNetworkMax: 0,
  retryNetworkDelayMs: 0,
});

export type CommentSuggestionActor = { id: number; role: "TEACHER" | "ADMIN" };
export type CommentSuggestion = { attempt_id: number; comment: string };

export async function runCommentSuggestion(
  actor: CommentSuggestionActor,
  attemptId: number,
): Promise<CommentSuggestion> {
  // Phạm vi (404) và điều kiện nghiệp vụ (422) bị từ chối ở đây: không AI, không log, không tốn lượt.
  const { variables } = await prepareSuggest(actor, attemptId);
  const ai = getDefaultAiDeps();

  let logAttempted = false;
  const logger: AiUsageLogger = {
    log(entry) {
      logAttempted = true;
      return ai.logger.log(entry);
    },
  };

  try {
    const prompt = await buildPrompt(COMMENT_SUGGEST_PROMPT_KEY, variables);
    const { data } = await runAiTask({
      userId: actor.id,
      role: actor.role,
      task: "suggest_comment",
      prompt,
      schema: commentSuggestSchema,
    }, { ...ai, provider: suggestProvider, logger });

    return { attempt_id: attemptId, comment: data.comment };
  } catch (error) {
    // Lỗi dựng prompt hoặc đếm lượt có thể xảy ra trước khi T9 ghi log.
    if (!logAttempted) {
      await logAiUsage(logger, { userId: actor.id, task: "suggest_comment", status: "error", tokens: null });
    }
    if (
      error instanceof AIQuotaExceededError || error instanceof AIInvalidFormatError ||
      (error instanceof AIServiceError && error.code !== "AI_ERROR")
    ) throw error;

    if (error instanceof AIProviderError && error.kind === "INVALID_RESPONSE") {
      throw new AIInvalidFormatError(1);
    }
    throw new AIServiceError("AI_UNAVAILABLE", error instanceof AIServiceError ? error.attempts : 0);
  }
}