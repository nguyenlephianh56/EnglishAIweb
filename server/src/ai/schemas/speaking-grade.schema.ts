import { z } from "zod";
import { SPEAKING_MAX_WORD_ISSUES } from "../speaking.constants";
import { tokenizeSpeakingWords } from "../speakingWords";

const criterionScore = z.number().finite().min(0).max(10);
const requiredText = z.string().trim().min(1);

const wordIssueSchema = z.object({ word: requiredText, issue: requiredText }).strict();

const speakingGradeOutputSchema = z.object({
  criteria: z.object({
    content: criterionScore,
    fluency: criterionScore,
    pronunciation: criterionScore,
  }).strict(),
  wordIssues: z.array(wordIssueSchema),
  comment: requiredText,
}).strict();

/** Lọc và giới hạn wordIssues trong bước Zod để cache chỉ nhận kết quả đã chuẩn hóa. */
export function createSpeakingGradeResultSchema(transcript: string) {
  const transcriptWords = new Set(tokenizeSpeakingWords(transcript));

  return speakingGradeOutputSchema.transform((result) => {
    const wordIssues = result.wordIssues.filter(({ word }) => {
      const words = tokenizeSpeakingWords(word);
      return words.length === 1 && transcriptWords.has(words[0]);
    });

    return { ...result, wordIssues: wordIssues.slice(0, SPEAKING_MAX_WORD_ISSUES) };
  });
}

export type SpeakingGradeResult = z.output<ReturnType<typeof createSpeakingGradeResultSchema>>;