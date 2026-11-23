import type { ComponentType } from "react";
import type { LibrarySkill } from "../../../../types/library";
import type { ExerciseTypeKey } from "../../../../types/exercise";

/** Giới hạn độ dài/số lượng theo backend (sau khi bỏ khoảng trắng đầu/cuối) */
export const LIMITS = {
  topic: 200,
  explanation: 5000,
  longText: 5000, // script, passage, text
  prompt: 2000, // prompt, hint, sample
  sentence: 1000,
  short: 500, // question, option, answer, wrong, correction
  pairItem: 200,
  questions: { min: 1, max: 20 },
  options: { min: 2, max: 6 },
  blanks: { min: 1, max: 20 },
  pairs: { min: 2, max: 15 },
  minWords: { min: 1, max: 1000 },
} as const;

/** Lỗi theo khóa dạng đường dẫn: "topic", "questions.0.q", "questions.0.options.2", "answers.1"... */
export type FieldErrors = Record<string, string>;

export interface EditorProps<S> {
  state: S;
  onChange: (next: S) => void;
  errors: FieldErrors;
}

export interface BuiltExercise {
  content: unknown;
  /** Không có (undefined) với dạng Viết và Nói: không gửi `answer` */
  answer?: unknown;
}

/** Một dạng bài trong form: nhãn, kỹ năng bị khóa (nếu có), editor, trạng thái ban đầu, kiểm tra và dựng body */
export interface FormDef<S> {
  label: string;
  skill?: LibrarySkill;
  editor: ComponentType<EditorProps<S>>;
  initial: () => S;
  /** Dựng trạng thái nhập liệu từ content/answer đã lưu (chế độ sửa); dữ liệu thiếu hoặc sai dạng thì để trống */
  fromExercise: (content: unknown, answer: unknown) => S;
  validate: (state: S) => FieldErrors;
  build: (state: S) => BuiltExercise;
}

// ---- Trạng thái nhập liệu của từng dạng (chuỗi thô, chưa trim) ----

export interface MultipleChoiceState {
  passage: string;
  questions: { q: string; options: string[]; /** vị trí đáp án đúng, -1 = chưa chọn */ correct: number }[];
}
export interface FillBlankState {
  text: string;
  hint: string;
  answers: string[];
}
export interface MatchingState {
  pairs: { left: string; right: string }[];
}
export interface ErrorCorrectionState {
  sentence: string;
  wrong: string;
  correction: string;
}
export interface ListeningFillState {
  script: string;
  /** Giữ chuỗi thô để gõ dở không bị mất */
  blanks: string;
  answers: string[];
}
export interface WritingState {
  prompt: string;
  minWords: string;
}
export interface SpeakingState {
  prompt: string;
  sample: string;
}

export interface StateMap {
  multiple_choice: MultipleChoiceState;
  fill_blank: FillBlankState;
  matching: MatchingState;
  error_correction: ErrorCorrectionState;
  listening_fill: ListeningFillState;
  writing: WritingState;
  speaking: SpeakingState;
}

export type FormRegistry = { [T in ExerciseTypeKey]: FormDef<StateMap[T]> };

export type FormMode = "create" | "edit";
