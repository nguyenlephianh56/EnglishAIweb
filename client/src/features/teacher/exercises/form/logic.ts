import { countBlanks } from "../../../exercises/answerUtils";
import { checkText, optionLetter, parseIntIn, resizeStrings } from "./helpers";
import { arr, asInt, asObj, asStr, asStrs } from "./parse";
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

// ---------------------------------------------------------------------------
// Dựng trạng thái nhập liệu từ bài đã lưu (chế độ sửa). Phòng thủ: sai dạng thì để trống thay vì ném lỗi.
// ---------------------------------------------------------------------------
export function mcFrom(content: unknown, answer: unknown): MultipleChoiceState {
  const c = asObj(content);
  const ans = arr(answer);
  const questions = arr(c.questions).map((raw, i) => {
    const q = asObj(raw);
    const options = asStrs(q.options);
    const correct = asInt(ans[i], -1);
    return { q: asStr(q.q), options, correct: correct >= 0 && correct < options.length ? correct : -1 };
  });
  return { passage: asStr(c.passage), questions: questions.length > 0 ? questions : [newQuestion()] };
}

export function fbFrom(content: unknown, answer: unknown): FillBlankState {
  const c = asObj(content);
  const text = asStr(c.text);
  return { text, hint: asStr(c.hint), answers: resizeStrings(asStrs(answer), Math.min(countBlanks(text.trim()), LIMITS.blanks.max)) };
}

export function mtFrom(content: unknown, answer: unknown): MatchingState {
  const c = asObj(content);
  const left = asStrs(c.left);
  const right = asStrs(c.right);
  const rows: MatchingState["pairs"] = [];
  const usedL = new Set<number>();
  const usedR = new Set<number>();
  // Đáp án có thể nối chéo (cặp [l, r] với l khác r): dựng lại từng dòng theo đúng cặp đã lưu
  for (const raw of arr(answer)) {
    const pair = arr(raw);
    const l = asInt(pair[0], -1);
    const r = asInt(pair[1], -1);
    if (l >= 0 && l < left.length && r >= 0 && r < right.length && !usedL.has(l) && !usedR.has(r)) {
      rows.push({ left: left[l], right: right[r] });
      usedL.add(l);
      usedR.add(r);
    }
  }
  // Phần chưa có cặp (đáp án thiếu/sai dạng) ghép theo thứ tự còn lại
  const restL = left.filter((_, i) => !usedL.has(i));
  const restR = right.filter((_, i) => !usedR.has(i));
  for (let i = 0; i < Math.max(restL.length, restR.length); i++) rows.push({ left: restL[i] ?? "", right: restR[i] ?? "" });
  return { pairs: rows.length > 0 ? rows : mtInitial().pairs };
}

export function ecFrom(content: unknown, answer: unknown): ErrorCorrectionState {
  const c = asObj(content);
  return { sentence: asStr(c.sentence), wrong: asStr(c.wrong), correction: asStr(arr(answer)[0]) };
}

export function lfFrom(content: unknown, answer: unknown): ListeningFillState {
  const c = asObj(content);
  const answers = asStrs(answer);
  const n = asInt(c.blanks, answers.length);
  return { script: asStr(c.script), blanks: String(n), answers: resizeStrings(answers, n > 0 ? Math.min(n, LIMITS.blanks.max) : answers.length) };
}

export function wrFrom(content: unknown): WritingState {
  const c = asObj(content);
  return { prompt: asStr(c.prompt), minWords: String(asInt(c.minWords, 50)) };
}

export function spFrom(content: unknown): SpeakingState {
  const c = asObj(content);
  return { prompt: asStr(c.prompt), sample: asStr(c.sample) };
}
