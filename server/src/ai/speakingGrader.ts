import { z } from "zod";
import { speakingContentSchema } from "../modules/exercises/exercise-content.schema";
import type { GradeError } from "../modules/grading/types";
import { round2 } from "../modules/grading/utils/score";
import { runAiTask, type AiServiceDeps } from "./ai.service";
import { AIQuotaExceededError } from "./ai.types";
import { getSpeakingUsageContinuation } from "./ai.usage";
import { AIInvalidFormatError } from "./json";
import { buildPrompt, type PromptTemplateDb } from "./prompts/prompt-templates";
import { AIServiceError, withResilience } from "./resilience";
import {
  createSpeakingGradeResultSchema,
  type SpeakingGradeResult,
} from "./schemas/speaking-grade.schema";
import { SPEAKING_MIN_TRANSCRIPT_WORDS } from "./speaking.constants";
import type { SpeakingTranscriptResult } from "./speakingTranscript";
import { compareWithSample, tokenizeSpeakingWords } from "./speakingWords";

export interface GradeSpeakingInput {
  /** ID của học sinh đã xác thực. */
  studentId: number;
  /** exercise.content đã lấy từ DB. */
  content: unknown;
  /** Kết quả từ getSpeakingTranscript trong cùng lần nộp. */
  transcript: SpeakingTranscriptResult;
}

export interface GradeSpeakingDeps {
  ai?: Partial<AiServiceDeps>;
  promptDb?: PromptTemplateDb;
  loadUsageContinuation?: typeof getSpeakingUsageContinuation;
}

export interface GradeSpeakingResult extends SpeakingGradeResult {
  score: number;
  errors: (Required<GradeError> & { type: "pronunciation" })[];
}

export class SpeakingGradeInputError extends Error {
  constructor(
    readonly code: "SPEAKING_GRADE_INVALID_INPUT" | "TRANSCRIPT_TOO_SHORT",
    readonly statusCode: 500 | 422,
    message: string
  ) {
    super(message);
    this.name = "SpeakingGradeInputError";
  }
}

const transcriptText = z.string().trim();
const inputSchema = z.object({
  studentId: z.number().int().positive().safe(),
  content: speakingContentSchema,
  transcript: z.discriminatedUnion("source", [
    z.object({ source: z.literal("client"), text: transcriptText }).strict(),
    z.object({
      source: z.literal("gemini"),
      text: transcriptText,
      usageLogId: z.number().int().positive().safe().optional(),
    }).strict(),
  ]),
}).strict();

/** Chấm bản chữ và trả kết quả chuẩn hóa để bước nộp bài xử lý. */
export async function gradeSpeaking(
  input: GradeSpeakingInput,
  deps: GradeSpeakingDeps = {}
): Promise<GradeSpeakingResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new SpeakingGradeInputError(
      "SPEAKING_GRADE_INVALID_INPUT", 500, "Tham số chấm bài Nói không hợp lệ."
    );
  }

  const { studentId, content, transcript } = parsed.data;
  const { text } = transcript;
  if (tokenizeSpeakingWords(text).length < SPEAKING_MIN_TRANSCRIPT_WORDS) {
    throw new SpeakingGradeInputError(
      "TRANSCRIPT_TOO_SHORT", 422, `Bản chữ cần ít nhất ${SPEAKING_MIN_TRANSCRIPT_WORDS} từ.`
    );
  }

  try {
    const prompt = await buildPrompt("speaking_grade", {
      prompt: content.prompt,
      sample: content.sample ?? "",
      sample_match_ratio: compareWithSample(text, content.sample) ?? "N/A",
      transcript: text,
    }, deps.promptDb);

    const loadUsageContinuation = deps.loadUsageContinuation ?? getSpeakingUsageContinuation;
    const speakingUsageContinuation = transcript.source === "gemini" && transcript.usageLogId !== undefined
      ? await loadUsageContinuation(studentId, transcript.usageLogId)
      : undefined;

    const rawProvider = deps.ai?.provider ?? new (await import("./gemini.provider")).GeminiProvider();
    const provider = withResilience(rawProvider, {
      retry429Max: 0,
      retry429DelayMs: 0,
      retryNetworkMax: 0,
      retryNetworkDelayMs: 0,
    });

    const { data } = await runAiTask({
      userId: studentId,
      role: "STUDENT",
      task: "grade_speaking",
      prompt,
      schema: createSpeakingGradeResultSchema(text),
      speakingUsageContinuation,
    }, { ...deps.ai, provider });

    const { content: contentScore, fluency, pronunciation } = data.criteria;
    return {
      score: round2((contentScore + fluency + pronunciation) / 3),
      ...data,
      errors: data.wordIssues.map(({ word, issue }) => ({
        type: "pronunciation",
        text: word,
        correction: word,
        explanation: issue,
      })),
    };
  } catch (error) {
    if (error instanceof AIQuotaExceededError || error instanceof AIInvalidFormatError) throw error;
    if (error instanceof AIServiceError && error.code !== "AI_ERROR") throw error;
    throw new AIServiceError("AI_UNAVAILABLE", error instanceof AIServiceError ? error.attempts : 0);
  }
}