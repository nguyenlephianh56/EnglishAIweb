import { z } from "zod";
import { Level, Skill } from "@prisma/client";
import {
  EXERCISE_TYPES,
  TYPES_WITHOUT_ANSWER,
  countBlanks,
  type ContentOf,
  type ExerciseType,
} from "./exercise-content.schema";
import { validateExercise } from "./validate-exercise";

/**
 * Schema cho JSON mà AI trả về khi sinh bài (T11), truyền cho generateJson/runAiTask.
 *
 * Gói MỘT chỗ mọi kiểm tra, nên lần thử lại 1 lần của T8 chính là "sai thì thử lại 1 lần":
 *   1. đủ 7 field, đúng kiểu (type, skill, level, topic, content, answer, explanation);
 *   2. type/skill/level KHỚP yêu cầu của người dùng;
 *   3. writing/speaking: answer bị ép về null (AI lỡ trả answer thì bỏ, không tính là sai);
 *   4. content + answer qua validateExercise (T1), dạng khác mà thiếu/null answer là sai;
 *   5. số mục khớp `count` (validateExercise đã kiểm độ dài answer so với content nên
 *      ở đây chỉ so content với count).
 *   6. (T12) riêng listening_fill: số `___` trong script == blanks, script 30-200 từ,
 *      mỗi đáp án 1-3 từ và <= 30 ký tự (xem checkListeningFill).
 * Field thừa (status, source, in_library...) bị Zod bỏ khi parse, không lọt ra kết quả.
 *
 * Lưu ý: generateJson chỉ đưa `đường dẫn + loại lỗi` vào lần thử lại, không đưa nội dung
 * sai, nên path của mỗi lỗi phải trỏ đúng field và message không cần chứa dữ liệu thô.
 */

export interface GeneratedExpectation {
  type: ExerciseType;
  skill: Skill;
  level: Level;
  count: number;
}

/** Số mục thực tế trong content (đã hợp lệ) và field dùng làm path khi lệch count. */
function actualCount(
  type: ExerciseType,
  content: unknown
): { count: number; path: string } | undefined {
  switch (type) {
    case "multiple_choice":
      return {
        count: (content as ContentOf<"multiple_choice">).questions.length,
        path: "questions",
      };
    case "fill_blank":
      return { count: countBlanks((content as ContentOf<"fill_blank">).text), path: "text" };
    case "matching":
      return { count: (content as ContentOf<"matching">).left.length, path: "left" };
    case "listening_fill":
      return { count: (content as ContentOf<"listening_fill">).blanks, path: "blanks" };
    case "error_correction":
      // Một bài = một câu (route đã ép count = 1).
      return { count: 1, path: "sentence" };
    default:
      // writing, speaking: không kiểm count.
      return undefined;
  }
}

/**
 * T12: giới hạn riêng cho bài Nghe (listening_fill). Chỉ dùng cho kịch bản + đáp án do AI sinh.
 * (Giới hạn cứng của T1: script <= 5000 ký tự, đáp án <= 500 ký tự, blanks 1-20 vẫn giữ nguyên.)
 */
export const LISTENING_LIMITS = {
  minScriptWords: 30,
  maxScriptWords: 200,
  maxAnswerChars: 30,
  maxAnswerWords: 3,
} as const;

/** Đếm từ theo khoảng trắng. Mỗi chỗ trống `___` tính là 1 từ. */
const countWords = (text: string): number => {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
};

/**
 * T12: kiểm riêng cho listening_fill, chạy SAU validateExercise (T1) nên content/answer đã đúng
 * khuôn, answer đã trim và không rỗng, answer.length == blanks. Ở đây chỉ bổ sung phần T1 thiếu:
 *   - số chỗ trống `___` thật trong script == blanks;
 *   - script có 30-200 từ;
 *   - mỗi đáp án 1-3 từ và tối đa 30 ký tự.
 * Message chỉ chứa số liệu, không chứa script hay đáp án thô (generateJson không đưa nội dung sai
 * vào lần thử lại, và log không được chứa nội dung bài).
 */
function checkListeningFill(
  ctx: z.RefinementCtx,
  content: ContentOf<"listening_fill">,
  answer: string[]
): void {
  const blanksInScript = countBlanks(content.script);
  if (blanksInScript !== content.blanks) {
    mismatch(
      ctx,
      ["content", "script"],
      `Số chỗ trống ___ trong script (${blanksInScript}) không khớp blanks (${content.blanks})`
    );
  }

  const words = countWords(content.script);
  if (words < LISTENING_LIMITS.minScriptWords || words > LISTENING_LIMITS.maxScriptWords) {
    mismatch(
      ctx,
      ["content", "script"],
      `Script có ${words} từ, phải từ ${LISTENING_LIMITS.minScriptWords} đến ${LISTENING_LIMITS.maxScriptWords} từ`
    );
  }

  answer.forEach((item, i) => {
    if (item.length > LISTENING_LIMITS.maxAnswerChars) {
      mismatch(
        ctx,
        ["answer", i],
        `Đáp án chỗ trống ${i + 1} dài ${item.length} ký tự, tối đa ${LISTENING_LIMITS.maxAnswerChars}`
      );
    }
    const answerWords = countWords(item);
    if (answerWords > LISTENING_LIMITS.maxAnswerWords) {
      mismatch(
        ctx,
        ["answer", i],
        `Đáp án chỗ trống ${i + 1} có ${answerWords} từ, tối đa ${LISTENING_LIMITS.maxAnswerWords} từ`
      );
    }
  });
}

const mismatch = (ctx: z.RefinementCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

export function buildGeneratedExerciseSchema(expected: GeneratedExpectation) {
  return z
    .object({
      type: z.enum(EXERCISE_TYPES),
      skill: z.nativeEnum(Skill),
      level: z.nativeEnum(Level),
      topic: z.string().trim().min(1).max(100),
      content: z.unknown(),
      answer: z.unknown(),
      explanation: z.string().trim().min(1),
    })
    .superRefine((data, ctx) => {
      // (2) Khớp yêu cầu.
      if (data.type !== expected.type) mismatch(ctx, ["type"], "type không khớp yêu cầu");
      if (data.skill !== expected.skill) mismatch(ctx, ["skill"], "skill không khớp yêu cầu");
      if (data.level !== expected.level) mismatch(ctx, ["level"], "level không khớp yêu cầu");

      // (3) + (4) writing/speaking: ép answer = null, các dạng khác giữ nguyên để T1 kiểm.
      const answer = TYPES_WITHOUT_ANSWER.includes(data.type) ? null : data.answer;
      const result = validateExercise(data.type, data.content, answer);
      if (!result.success) {
        for (const error of result.errors) {
          // Một phần tử path dạng chuỗi (vd "content.questions[0].options"): join(".") giữ nguyên.
          mismatch(ctx, [error.path], error.message);
        }
        return;
      }

      // (5) Chỉ so count khi type đã khớp (nếu lệch type thì đã báo lỗi ở trên).
      if (data.type !== expected.type) return;
      const actual = actualCount(data.type, result.data.content);
      if (actual && actual.count !== expected.count) {
        mismatch(
          ctx,
          ["content", actual.path],
          `Số mục (${actual.count}) không khớp count yêu cầu (${expected.count})`
        );
      }

      // T12: kiểm riêng cho bài Nghe (phần T1 chưa kiểm). Dạng khác không đi qua đây.
      if (data.type === "listening_fill") {
        checkListeningFill(
          ctx,
          result.data.content as ContentOf<"listening_fill">,
          result.data.answer as string[]
        );
      }
    })
    .transform((data) => {
      // Tới đây đã chắc chắn hợp lệ: lấy bản đã chuẩn hóa (trim, answer null cho Viết/Nói).
      const answer = TYPES_WITHOUT_ANSWER.includes(data.type) ? null : data.answer;
      const result = validateExercise(data.type, data.content, answer);
      if (!result.success) {
        // Không xảy ra vì superRefine đã chặn; giữ lại để TypeScript hiểu kiểu.
        throw new Error("GENERATED_EXERCISE_INVALID");
      }
      return {
        type: data.type,
        skill: data.skill,
        level: data.level,
        topic: data.topic,
        content: result.data.content as unknown,
        answer: result.data.answer as unknown,
        explanation: data.explanation,
      };
    });
}

/** Object bài đã hợp lệ (chưa lưu DB). */
export type GeneratedExerciseDraft = z.output<ReturnType<typeof buildGeneratedExerciseSchema>>;