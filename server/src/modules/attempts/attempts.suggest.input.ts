// =====================================================================
// attempts.suggest.input.ts — Phần THUẦN của "Gợi ý nhận xét cho GV" (T27).
//
//   evaluateSuggestable(type, answer) : kiểm điều kiện nghiệp vụ TRƯỚC khi gọi AI
//   buildSuggestVariables(...)        : dựng biến cho buildPrompt("comment_suggest", ...)
//
// Không đụng DB/env/AI nên test thoải mái. Quy tắc dữ liệu gửi AI (danh sách trắng):
//   - CÓ: type, skill, level, đề (content.prompt), bài làm (answer.text, cắt tối đa N ký tự),
//     score AI, teacher_score, tiêu chí + nhận xét AI (qua readAiFeedback), tối đa K lỗi
//     dạng { type, correction }.
//   - KHÔNG: tên/email/id HS hay GV, answer (đáp án) và explanation của bài, phần content ngoài
//     đề (minWords, sample...), ai_feedback thô, text/explanation của lỗi.
//   - Đề, bài làm, dữ liệu chấm là DỮ LIỆU: ngoài việc buildPrompt bọc thẻ + vô hiệu chuỗi đóng
//     thẻ của CHÍNH thẻ đó, ở đây còn vô hiệu mở/đóng của CẢ BA thẻ trong mọi đoạn, để bài làm
//     không giả được ranh giới của thẻ khác.
// =====================================================================
import { LIMITS } from "../exercises/exercise-content.schema";
import {
  COMMENT_SUGGEST_EXERCISE_PROMPT_TAG,
  COMMENT_SUGGEST_GRADING_DATA_TAG,
  COMMENT_SUGGEST_STUDENT_TEXT_TAG,
} from "../../ai/prompts/comment-suggest.prompt";
import { readAiFeedback, round2 } from "./attempt-result";

/** Số ký tự bài làm tối đa gửi AI (một nơi duy nhất). */
export const SUGGEST_MAX_TEXT_CHARS = 3000;
/** Số lỗi tối đa gửi AI. */
export const SUGGEST_MAX_ERRORS = 5;

const SUGGEST_MAX_COMMENT_CHARS = 1000;
const SUGGEST_MAX_ERROR_TYPE_CHARS = 60;
const SUGGEST_MAX_ERROR_CORRECTION_CHARS = 200;

export const SUGGESTABLE_TYPES = ["writing", "speaking"] as const;

export type SuggestableCheck =
  | { ok: true; text: string }
  | { ok: false; code: "UNSUPPORTED_EXERCISE_TYPE" | "NO_TEXT_TO_COMMENT"; message: string };

export const UNSUPPORTED_EXERCISE_TYPE_MESSAGE =
  "Chỉ gợi ý nhận xét cho bài Viết hoặc bài Nói";
export const NO_TEXT_TO_COMMENT_MESSAGE = "Bài nộp không có nội dung chữ để nhận xét";

/** Đọc `answer.text` (bài Viết `{text}`, bài Nói bản chữ `{text}`); không phải chuỗi thì "". */
export function readSubmissionText(answer: unknown): string {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return "";
  const text = (answer as Record<string, unknown>).text;
  return typeof text === "string" ? text.trim() : "";
}

/** Điều kiện nghiệp vụ: đúng dạng bài (422 UNSUPPORTED_EXERCISE_TYPE), có chữ (422 NO_TEXT_TO_COMMENT). */
export function evaluateSuggestable(exerciseType: string, answer: unknown): SuggestableCheck {
  if (!(SUGGESTABLE_TYPES as readonly string[]).includes(exerciseType)) {
    return { ok: false, code: "UNSUPPORTED_EXERCISE_TYPE", message: UNSUPPORTED_EXERCISE_TYPE_MESSAGE };
  }
  const text = readSubmissionText(answer);
  if (text === "") {
    return { ok: false, code: "NO_TEXT_TO_COMMENT", message: NO_TEXT_TO_COMMENT_MESSAGE };
  }
  return { ok: true, text };
}

const SUGGEST_TAGS = [
  COMMENT_SUGGEST_EXERCISE_PROMPT_TAG,
  COMMENT_SUGGEST_STUDENT_TEXT_TAG,
  COMMENT_SUGGEST_GRADING_DATA_TAG,
];
const TAG_LIKE = new RegExp(String.raw`<(?=\s*/?\s*(?:${SUGGEST_TAGS.join("|")})(?![A-Za-z0-9_]))`, "gi");

/** Đổi `<` đứng trước tên một trong ba thẻ (mở hoặc đóng, cho phép khoảng trắng) thành `&lt;`. */
export function neutralizeSuggestTags(text: string): string {
  return text.replace(TAG_LIKE, "&lt;");
}

/** Cắt theo UTF-16 (như `.length`), không để lại nửa cặp surrogate. */
function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = text.slice(0, max);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

const finiteOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? round2(value) : null;

/** Tối đa K lỗi hợp lệ, mỗi lỗi chỉ còn { type, correction }; mục hỏng bị bỏ (không báo lỗi). */
export function pickSuggestErrors(raw: unknown): { type: string; correction: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { type: string; correction: string }[] = [];
  for (const item of raw) {
    if (out.length >= SUGGEST_MAX_ERRORS) break;
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const { type, correction } = item as Record<string, unknown>;
    if (typeof type !== "string" || typeof correction !== "string") continue;
    const t = type.trim();
    const c = correction.trim();
    if (t === "" || c === "") continue;
    out.push({
      type: cut(t, SUGGEST_MAX_ERROR_TYPE_CHARS),
      correction: cut(c, SUGGEST_MAX_ERROR_CORRECTION_CHARS),
    });
  }
  return out;
}

/** Chỉ các field này của bài tập được đọc (object đầy đủ từ Prisma vẫn truyền vào được). */
export interface SuggestExerciseInput {
  type: string;
  skill: string;
  level: string;
  content: unknown;
}

/** Chỉ các field này của bài nộp được đọc. */
export interface SuggestAttemptInput {
  answer: unknown;
  score: number | null;
  teacherScore: number | null;
  aiFeedback: unknown;
  errors: unknown;
}

/** `type` (không phải interface) để gán được vào PromptVariables của buildPrompt. */
export type SuggestVariables = {
  type: string;
  skill: string;
  level: string;
  exercise_prompt: string;
  student_text: string;
  grading_data: string;
};

function readExercisePrompt(content: unknown): string {
  if (typeof content !== "object" || content === null || Array.isArray(content)) return "";
  const prompt = (content as Record<string, unknown>).prompt;
  return typeof prompt === "string" ? cut(prompt.trim(), LIMITS.prompt) : "";
}

/**
 * Dựng biến cho buildPrompt("comment_suggest", ...). Giả định bài đã qua evaluateSuggestable
 * (nếu không có chữ thì student_text là chuỗi rỗng, không ném lỗi).
 */
export function buildSuggestVariables(
  exercise: SuggestExerciseInput,
  attempt: SuggestAttemptInput,
): SuggestVariables {
  const fullText = readSubmissionText(attempt.answer);
  const studentText = cut(fullText, SUGGEST_MAX_TEXT_CHARS);
  const feedback = readAiFeedback(attempt.aiFeedback);

  const grading = {
    score: finiteOrNull(attempt.score),
    teacher_score: finiteOrNull(attempt.teacherScore),
    criteria: feedback.criteria ?? null,
    comment: feedback.comment === undefined
      ? null
      : cut(feedback.comment.trim(), SUGGEST_MAX_COMMENT_CHARS),
    errors: pickSuggestErrors(attempt.errors),
    ...(studentText.length < fullText.length ? { submission_truncated: true } : {}),
  };

  return {
    type: exercise.type,
    skill: exercise.skill,
    level: exercise.level,
    exercise_prompt: neutralizeSuggestTags(readExercisePrompt(exercise.content)),
    student_text: neutralizeSuggestTags(studentText),
    grading_data: neutralizeSuggestTags(JSON.stringify(grading)),
  };
}