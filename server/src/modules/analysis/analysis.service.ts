import { Role, UserStatus } from "@prisma/client";
import { logAiUsage } from "../../ai/ai.log";
import { runAiTask } from "../../ai/ai.service";
import { getDefaultAiDeps } from "../../ai/ai.service.defaults";
import { AIQuotaExceededError, type AiUsageLogger } from "../../ai/ai.types";
import { GeminiProvider } from "../../ai/gemini.provider";
import { AIInvalidFormatError } from "../../ai/json";
import { ANALYSIS_PROMPT_KEYS, analysisPromptVariables } from "../../ai/prompts/analysis.prompt";
import { buildPrompt } from "../../ai/prompts/prompt-templates";
import { AIProviderError } from "../../ai/provider";
import { AIServiceError, withResilience } from "../../ai/resilience";
import { createAnalysisResultSchema } from "../../ai/schemas/analysis.schema";
import { prisma } from "../../config/prisma";
import {
  findStudentForSkillProfile,
  readSavedSkillProfiles,
} from "../skill-profiles/skill-profiles.service";
import { aggregateAnalysisStats } from "./analysis.stats";

export type AnalysisScope = "student" | "class";

const analysisProvider = withResilience(new GeminiProvider(), {
  retry429Max: 0,
  retry429DelayMs: 0,
  retryNetworkMax: 0,
  retryNetworkDelayMs: 0,
});

export class AnalysisInputError extends Error {
  constructor(
    readonly statusCode: 404 | 422,
    readonly code: "CLASS_NOT_FOUND" | "NOT_ENOUGH_DATA",
    message: string,
  ) {
    super(message);
  }
}

async function loadStudent(studentId: number, teacherId?: number) {
  const target = await findStudentForSkillProfile(studentId, { teacherId });
  const rows = await readSavedSkillProfiles(target.id);
  return { target, rows };
}

async function loadClass(classId: number, teacherId?: number) {
  const where = { id: classId, ...(teacherId === undefined ? {} : { teacherId }) };
  const target = await prisma.class.findFirst({
    where,
    select: { id: true, name: true },
  });
  if (!target) throw new AnalysisInputError(404, "CLASS_NOT_FOUND", "Không tìm thấy lớp");

  const rows = await prisma.skillProfile.findMany({
    where: {
      student: {
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
        memberships: { some: { class: where } },
      },
    },
    select: { skill: true, score: true, level: true, errorStats: true },
  });
  return { target, rows };
}

export async function prepareAnalysis(scope: AnalysisScope, id: number, teacherId?: number) {
  const { target, rows } = scope === "student"
    ? await loadStudent(id, teacherId)
    : await loadClass(id, teacherId);
  const stats = aggregateAnalysisStats(scope, rows);
  if (Object.values(stats.skills).every((skill) => skill === null)) {
    throw new AnalysisInputError(422, "NOT_ENOUGH_DATA", "Chưa đủ dữ liệu để phân tích");
  }

  return { scope, target, stats };
}

export async function runAnalysis(
  scope: AnalysisScope,
  id: number,
  actor: { id: number; role: "TEACHER" | "ADMIN" },
) {
  const teacherId = actor.role === Role.TEACHER ? actor.id : undefined;
  const prepared = await prepareAnalysis(scope, id, teacherId);
  const { stats } = prepared;
  const ai = getDefaultAiDeps();

  let logAttempted = false;
  const logger: AiUsageLogger = {
    log(entry) {
      logAttempted = true;
      return ai.logger.log(entry);
    },
  };

  try {
    const prompt = await buildPrompt(ANALYSIS_PROMPT_KEYS[scope], analysisPromptVariables(stats));
    const { data } = await runAiTask({
      userId: actor.id,
      role: actor.role,
      task: "analysis",
      prompt,
      schema: createAnalysisResultSchema(stats.top_errors),
    }, { ...ai, provider: analysisProvider, logger });

    return { ...prepared, analysis: data, generated_at: new Date().toISOString() };
  } catch (error) {
    // Lỗi dựng prompt hoặc đếm lượt có thể xảy ra trước khi T9 ghi log.
    if (!logAttempted) {
      await logAiUsage(logger, { userId: actor.id, task: "analysis", status: "error", tokens: null });
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