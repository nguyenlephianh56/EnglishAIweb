import type { Skill } from "@prisma/client";
import { z } from "zod";
import { PROFILE_SKILL_ORDER } from "../../modules/skill-profiles/skill-profiles.schema";

export const ANALYSIS_LIMITS = {
  summary: 600,
  weaknesses: 5,
  suggestions: 5,
  description: 320,
  suggestionText: 320,
  errorType: 120,
} as const;

const skills: ReadonlySet<unknown> = new Set(PROFILE_SKILL_ORDER);
const skillSchema = z.custom<Skill>((value) => skills.has(value), "Kỹ năng không hợp lệ");

const weaknessSchema = z.object({
  skill: skillSchema,
  error_type: z.string().min(1).max(ANALYSIS_LIMITS.errorType).nullable(),
  description: z.string().trim().min(1).max(ANALYSIS_LIMITS.description),
}).strict();

const suggestionSchema = z.object({
  skill: skillSchema.nullable(),
  text: z.string().trim().min(1).max(ANALYSIS_LIMITS.suggestionText),
}).strict();

const analysisEnvelope = z.object({
  summary: z.string().trim().min(1).max(ANALYSIS_LIMITS.summary),
  weaknesses: z.array(z.unknown()).max(ANALYSIS_LIMITS.weaknesses),
  suggestions: z.array(z.unknown()).max(ANALYSIS_LIMITS.suggestions),
}).strict();

export function createAnalysisResultSchema(topErrors: readonly { type: string }[]) {
  const allowedErrorTypes = new Set(topErrors.map(({ type }) => type));

  return analysisEnvelope.transform(({ summary, weaknesses, suggestions }, ctx) => {
    const validWeaknesses = weaknesses.flatMap((item) => {
      const parsed = weaknessSchema.safeParse(item);
      if (!parsed.success) return [];
      const type = parsed.data.error_type;
      return type === null || allowedErrorTypes.has(type) ? [parsed.data] : [];
    });
    const validSuggestions = suggestions.flatMap((item) => {
      const parsed = suggestionSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });

    if (validWeaknesses.length === 0 && validSuggestions.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cần ít nhất một mục phân tích hợp lệ" });
      return z.NEVER;
    }

    return { summary, weaknesses: validWeaknesses, suggestions: validSuggestions };
  });
}

export type AnalysisResult = z.output<ReturnType<typeof createAnalysisResultSchema>>;
