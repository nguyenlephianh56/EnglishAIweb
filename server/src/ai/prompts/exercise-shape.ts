// =====================================================================
// ai/prompts/exercise-shape.ts — Mô tả khuôn `content`/`answer` của 7 dạng bài (T10, bước 3).
//
// Dùng cho biến {{exercise_shape}} của mẫu `exercise_generate`: code gọi
// buildExerciseShape(type) rồi truyền kết quả vào buildPrompt. Nhờ vậy thêm dạng
// bài mới chỉ cần thêm một mục ở đây, KHÔNG phải sửa mẫu prompt.
//
// Chống lệch khuôn:
//   - Record<ExerciseType, ...> -> T1 thêm dạng mới mà quên mục ở đây thì tsc báo lỗi.
//   - Giới hạn số lượng lấy từ LIMITS của T1 (không gõ tay).
//   - Test kiểm ví dụ của từng dạng phải qua validateExercise của T1.
//
// File này là dữ liệu thuần: không import prisma/env, không log.
// =====================================================================

import { LIMITS, type ExerciseType } from "../../modules/exercises/exercise-content.schema";
import { PROMPT_NOT_FOUND_CODE, PromptError } from "./render";

export interface ExerciseShapeSpec {
  /** Khuôn của `content` (viết cho model đọc). */
  contentShape: string;
  /** Khuôn của `answer`. */
  answerShape: string;
  /** Biến `count` nghĩa là gì với dạng này. */
  countMeaning: string;
  /** Các quy tắc bắt buộc (mỗi dòng một quy tắc). */
  rules: readonly string[];
  /** Ví dụ hợp lệ (test kiểm bằng validateExercise). Chỉ để minh họa khuôn. */
  example: { content: unknown; answer: unknown };
}

export const EXERCISE_SHAPES: Readonly<Record<ExerciseType, ExerciseShapeSpec>> = {
  multiple_choice: {
    contentShape: `{"passage": string (optional), "questions": [{"q": string, "options": [string, ...]}]}`,
    answerShape: `an array of integers, one per question, in question order: the 0-BASED index of the correct option (first option = 0). Example: [1, 0]`,
    countMeaning: `the number of questions (1 to ${LIMITS.maxQuestions})`,
    rules: [
      `Write exactly "count" questions.`,
      `Each question has ${LIMITS.minOptions} to ${LIMITS.maxOptions} options and exactly ONE correct option; no two options may be identical (ignoring upper/lower case).`,
      `Vary the position of the correct option; do not always use the same index.`,
      `"passage" is optional: include a short passage suited to the level when the questions are about reading; otherwise omit the field.`,
      `Do not add any other fields.`,
    ],
    example: {
      content: {
        passage: "Tom gets up at seven o'clock. He has breakfast and goes to school by bus.",
        questions: [
          { q: "What time does Tom get up?", options: ["At six", "At seven", "At eight"] },
          { q: "How does Tom go to school?", options: ["By bus", "By bike", "On foot"] },
        ],
      },
      answer: [1, 0],
    },
  },

  fill_blank: {
    contentShape: `{"text": string, "hint": string (optional)} where "text" contains the blanks`,
    answerShape: `an array of strings, one per blank, in order of appearance in "text". Example: ["goes"]`,
    countMeaning: `the number of blanks (1 to ${LIMITS.maxBlanks})`,
    rules: [
      `Write each blank as exactly three underscores ___ . Do not use any other run of three or more underscores in the text.`,
      `The number of blanks must equal "count" and must equal the length of "answer".`,
      `Each blank has one clearly correct short answer (a word or a very short phrase) that the context makes unambiguous.`,
      `"hint" is optional (for example the base form of the word); omit it if not needed.`,
      `Do not add any other fields.`,
    ],
    example: {
      content: { text: "She ___ to school every day.", hint: "go (present simple)" },
      answer: ["goes"],
    },
  },

  matching: {
    contentShape: `{"left": [string, ...], "right": [string, ...]} (both lists have the same length)`,
    answerShape: `an array of pairs [leftIndex, rightIndex] (0-based), one pair per left item. Example: [[0, 1], [1, 2], [2, 0]]`,
    countMeaning: `the number of pairs (${LIMITS.minPairs} to ${LIMITS.maxPairs})`,
    rules: [
      `"left" and "right" must both contain exactly "count" items.`,
      `Every left item matches exactly one right item; no index may be used twice in "answer".`,
      `Shuffle the "right" list so it is NOT in the same order as "left" (the answer must not be trivially [[0,0],[1,1],...]).`,
      `Keep every item short (at most ${LIMITS.matchingItem} characters).`,
      `Do not add any other fields.`,
    ],
    example: {
      content: { left: ["big", "happy", "fast"], right: ["quick", "large", "glad"] },
      answer: [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
    },
  },

  error_correction: {
    contentShape: `{"sentence": string, "wrong": string}`,
    answerShape: `an array with exactly ONE string: the corrected replacement for "wrong". Example: ["goes"]`,
    countMeaning: `ignored: create exactly one sentence with exactly one error`,
    rules: [
      `"sentence" contains exactly one error.`,
      `"wrong" must be copied EXACTLY (same letters and same upper/lower case) from "sentence" and must be the smallest part that is wrong.`,
      `The correction must be different from "wrong" and must make the sentence correct.`,
      `Do not add any other fields.`,
    ],
    example: {
      content: { sentence: "She go to school every day.", wrong: "go" },
      answer: ["goes"],
    },
  },

  listening_fill: {
    contentShape: `{"script": string, "blanks": integer} where "script" is the listening text with the missing words replaced by blanks`,
    answerShape: `an array of strings, one per blank, in order of appearance in "script". Example: ["market", "bread"]`,
    countMeaning: `the number of blanks (1 to ${LIMITS.maxBlanks})`,
    rules: [
      `Write each blank as exactly three underscores ___ . Do not use any other run of three or more underscores.`,
      `"blanks" must equal "count", the number of ___ in "script", and the length of "answer".`,
      `Write plain text meant to be read aloud by a text-to-speech voice: no speaker labels, no stage directions, no markdown.`,
      `Each blank is a single word that can be clearly heard (for example a noun, verb, number or time) with one clearly correct answer.`,
      `Do not add any other fields.`,
    ],
    example: {
      content: { script: "Anna goes to the ___ at eight and buys some ___ for lunch.", blanks: 2 },
      answer: ["market", "bread"],
    },
  },

  writing: {
    contentShape: `{"prompt": string, "minWords": integer}`,
    answerShape: `null (this type has no answer; write "answer": null)`,
    countMeaning: `ignored: create exactly one writing task`,
    rules: [
      `"prompt" is a clear writing task (one to three sentences) that fits the level and the topic.`,
      `"minWords" is a whole number from 1 to ${LIMITS.maxMinWords}; choose a realistic length for the level (about 40-60 for A1, 60-90 for A2, 90-130 for B1, 130-200 for B2).`,
      `Do not add any other fields.`,
    ],
    example: {
      content: { prompt: "Write about what you did last weekend.", minWords: 80 },
      answer: null,
    },
  },

  speaking: {
    contentShape: `{"prompt": string, "sample": string (optional)}`,
    answerShape: `null (this type has no answer; write "answer": null)`,
    countMeaning: `ignored: create exactly one speaking task`,
    rules: [
      `"prompt" is a clear speaking task (one to three sentences) that fits the level and the topic.`,
      `"sample" is an optional model answer suited to the level; omit it if not needed.`,
      `Do not add any other fields.`,
    ],
    example: {
      content: {
        prompt: "Describe your daily routine.",
        sample: "I usually get up at six. Then I have breakfast and go to school.",
      },
      answer: null,
    },
  },
};

/**
 * Văn bản mô tả khuôn của một dạng bài, để truyền vào biến {{exercise_shape}}.
 * Dạng lạ -> PROMPT_NOT_FOUND.
 */
export function buildExerciseShape(type: string): string {
  if (!Object.prototype.hasOwnProperty.call(EXERCISE_SHAPES, type)) {
    throw new PromptError(PROMPT_NOT_FOUND_CODE, "Không có khuôn bài cho dạng bài này.");
  }
  const spec = EXERCISE_SHAPES[type as ExerciseType];
  return [
    `Exercise type: ${type}`,
    `"content" must be a JSON object shaped like: ${spec.contentShape}`,
    `"answer" must be: ${spec.answerShape}`,
    `How to use "count": ${spec.countMeaning}.`,
    `Rules:`,
    ...spec.rules.map((rule) => `- ${rule}`),
    `Example of the shape only (write NEW original content, do not copy this example):`,
    JSON.stringify(spec.example),
  ].join("\n");
}