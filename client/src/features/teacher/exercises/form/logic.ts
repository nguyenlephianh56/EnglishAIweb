import { countBlanks } from "../../../exercises/answerUtils";
import { checkText, optionLetter, parseIntIn, resizeStrings } from "./helpers";
import { LIMITS } from "./types";
import type {
  BuiltExercise,
  ErrorCorrectionState,
  FieldErrors,
  FillBlankState,
  ListeningFillState,
  MatchingState,
  MultipleChoiceState,
  SpeakingState,
  WritingState,
} from "./types";

const t = (s: string) => s.trim();
const optional = (s: string) => (t(s) ? t(s) : undefined);

// ---------------------------------------------------------------------------
// Trắc nghiệm: content {passage?, questions:[{q, options}]}, answer number[]
// ---------------------------------------------------------------------------
export const newQuestion = () => ({ q: "", options: ["", "", "", ""], correct: -1 });

export const mcInitial = (): MultipleChoiceState => ({ passage: "", questions: [newQuestion()] });

export function mcValidate(s: MultipleChoiceState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "passage", s.passage, "đoạn văn", LIMITS.longText, false);
  if (s.questions.length < LIMITS.questions.min || s.questions.length > LIMITS.questions.max) e.questions = `Bài cần từ ${LIMITS.questions.min} đến ${LIMITS.questions.max} câu hỏi`;
  s.questions.forEach((q, i) => {
    checkText(e, `questions.${i}.q`, q.q, "câu hỏi", LIMITS.short);
    if (q.options.length < LIMITS.options.min || q.options.length > LIMITS.options.max) e[`questions.${i}.options`] = `Mỗi câu cần từ ${LIMITS.options.min} đến ${LIMITS.options.max} lựa chọn`;
    const seen = new Set<string>();
    q.options.forEach((o, j) => {
      const key = `questions.${i}.options.${j}`;
      checkText(e, key, o, `lựa chọn ${optionLetter(j)}`, LIMITS.short);
      const norm = t(o).toLowerCase();
      if (norm && !e[key]) {
        if (seen.has(norm)) e[key] = "Lựa chọn bị trùng với lựa chọn khác trong câu này";
        seen.add(norm);
      }
    });
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= q.options.length) e[`questions.${i}.correct`] = "Hãy chọn đáp án đúng";
  });
  return e;
}

export const mcBuild = (s: MultipleChoiceState): BuiltExercise => ({
  content: { ...(optional(s.passage) ? { passage: t(s.passage) } : {}), questions: s.questions.map((q) => ({ q: t(q.q), options: q.options.map(t) })) },
  answer: s.questions.map((q) => q.correct),
});

// ---------------------------------------------------------------------------
// Điền từ: content {text, hint?}, answer string[] (mỗi chỗ trống một đáp án)
// ---------------------------------------------------------------------------
export const fbInitial = (): FillBlankState => ({ text: "", hint: "", answers: [] });

export function fbValidate(s: FillBlankState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "text", s.text, "văn bản", LIMITS.longText);
  checkText(e, "hint", s.hint, "gợi ý", LIMITS.prompt, false);
  const n = countBlanks(t(s.text));
  if (t(s.text) && !e.text) {
    if (n < 1) e.text = "Văn bản cần ít nhất một chỗ trống (gõ từ 3 dấu gạch dưới ___ trở lên)";
    else if (n > LIMITS.blanks.max) e.text = `Tối đa ${LIMITS.blanks.max} chỗ trống`;
  }
  if (!e.text) for (let i = 0; i < n; i++) checkText(e, `answers.${i}`, s.answers[i] ?? "", `đáp án chỗ trống ${i + 1}`, LIMITS.short);
  return e;
}

export const fbBuild = (s: FillBlankState): BuiltExercise => ({
  content: { text: t(s.text), ...(optional(s.hint) ? { hint: t(s.hint) } : {}) },
  answer: resizeStrings(s.answers, countBlanks(t(s.text))).map(t),
});

// ---------------------------------------------------------------------------
// Nối cặp: content {left[], right[]}, answer [[0,0],[1,1],...]
// ---------------------------------------------------------------------------
export const mtInitial = (): MatchingState => ({ pairs: [{ left: "", right: "" }, { left: "", right: "" }] });

export function mtValidate(s: MatchingState): FieldErrors {
  const e: FieldErrors = {};
  if (s.pairs.length < LIMITS.pairs.min || s.pairs.length > LIMITS.pairs.max) e.pairs = `Bài cần từ ${LIMITS.pairs.min} đến ${LIMITS.pairs.max} cặp`;
  s.pairs.forEach((p, i) => {
    checkText(e, `pairs.${i}.left`, p.left, "vế trái", LIMITS.pairItem);
    checkText(e, `pairs.${i}.right`, p.right, "vế phải", LIMITS.pairItem);
  });
  return e;
}

export const mtBuild = (s: MatchingState): BuiltExercise => ({
  content: { left: s.pairs.map((p) => t(p.left)), right: s.pairs.map((p) => t(p.right)) },
  answer: s.pairs.map((_, i) => [i, i]),
});

// ---------------------------------------------------------------------------
// Sửa lỗi: content {sentence, wrong}, answer [correction]
// ---------------------------------------------------------------------------
export const ecInitial = (): ErrorCorrectionState => ({ sentence: "", wrong: "", correction: "" });

export function ecValidate(s: ErrorCorrectionState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "sentence", s.sentence, "câu có lỗi", LIMITS.sentence);
  checkText(e, "wrong", s.wrong, "phần sai", LIMITS.short);
  checkText(e, "correction", s.correction, "bản sửa đúng", LIMITS.short);
  if (!e.wrong && !e.sentence && !t(s.sentence).includes(t(s.wrong))) e.wrong = "Phần sai phải xuất hiện đúng nguyên văn trong câu (phân biệt hoa/thường)";
  if (!e.correction && !e.wrong && t(s.correction).toLowerCase() === t(s.wrong).toLowerCase()) e.correction = "Bản sửa phải khác phần sai";
  return e;
}

export const ecBuild = (s: ErrorCorrectionState): BuiltExercise => ({
  content: { sentence: t(s.sentence), wrong: t(s.wrong) },
  answer: [t(s.correction)],
});

// ---------------------------------------------------------------------------
// Nghe điền từ: content {script, blanks}, answer string[] (độ dài = blanks)
// ---------------------------------------------------------------------------
export const lfInitial = (): ListeningFillState => ({ script: "", blanks: "1", answers: [""] });

export function lfValidate(s: ListeningFillState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "script", s.script, "nội dung bài nghe", LIMITS.longText);
  const n = parseIntIn(s.blanks, LIMITS.blanks.min, LIMITS.blanks.max);
  if (n === undefined) e.blanks = `Số chỗ trống phải là số nguyên từ ${LIMITS.blanks.min} đến ${LIMITS.blanks.max}`;
  else for (let i = 0; i < n; i++) checkText(e, `answers.${i}`, s.answers[i] ?? "", `đáp án chỗ trống ${i + 1}`, LIMITS.short);
  return e;
}

export const lfBuild = (s: ListeningFillState): BuiltExercise => {
  const n = parseIntIn(s.blanks, LIMITS.blanks.min, LIMITS.blanks.max) ?? 0;
  return { content: { script: t(s.script), blanks: n }, answer: resizeStrings(s.answers, n).map(t) };
};

// ---------------------------------------------------------------------------
// Viết: content {prompt, minWords}, không có answer
// ---------------------------------------------------------------------------
export const wrInitial = (): WritingState => ({ prompt: "", minWords: "50" });

export function wrValidate(s: WritingState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "prompt", s.prompt, "đề bài", LIMITS.prompt);
  if (parseIntIn(s.minWords, LIMITS.minWords.min, LIMITS.minWords.max) === undefined) e.minWords = `Số từ tối thiểu phải là số nguyên từ ${LIMITS.minWords.min} đến ${LIMITS.minWords.max}`;
  return e;
}

export const wrBuild = (s: WritingState): BuiltExercise => ({
  content: { prompt: t(s.prompt), minWords: parseIntIn(s.minWords, LIMITS.minWords.min, LIMITS.minWords.max) ?? 0 },
});

// ---------------------------------------------------------------------------
// Nói: content {prompt, sample?}, không có answer
// ---------------------------------------------------------------------------
export const spInitial = (): SpeakingState => ({ prompt: "", sample: "" });

export function spValidate(s: SpeakingState): FieldErrors {
  const e: FieldErrors = {};
  checkText(e, "prompt", s.prompt, "đề bài", LIMITS.prompt);
  checkText(e, "sample", s.sample, "bài nói mẫu", LIMITS.prompt, false);
  return e;
}

export const spBuild = (s: SpeakingState): BuiltExercise => ({ content: { prompt: t(s.prompt), ...(optional(s.sample) ? { sample: t(s.sample) } : {}) } });
