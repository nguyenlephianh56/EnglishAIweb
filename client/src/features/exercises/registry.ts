import type { ComponentType } from "react";
import type { AnswerableExerciseType, ExerciseContentMap, ExerciseValueMap } from "../../types/exercise";
import { countBlanks, countWords } from "./answerUtils";
import type { ExerciseRendererProps } from "./rendererTypes";
import ErrorCorrection from "./renderers/ErrorCorrection";
import FillBlank from "./renderers/FillBlank";
import ListeningFill from "./renderers/ListeningFill";
import Matching from "./renderers/Matching";
import MultipleChoice from "./renderers/MultipleChoice";
import WritingEditor from "./renderers/WritingEditor";

export interface ExerciseTypeDefinition<T extends AnswerableExerciseType> {
  /** Nhãn tiếng Việt của dạng bài */
  label: string;
  Renderer: ComponentType<ExerciseRendererProps<T>>;
  /** Giá trị khởi tạo khi học sinh bắt đầu làm (đúng hình dạng body gửi backend) */
  emptyValue: (content: ExerciseContentMap[T]) => ExerciseValueMap[T];
  /** Đã làm đủ để được gửi chưa (bài viết: đủ số từ tối thiểu) */
  isAnswered: (value: ExerciseValueMap[T], content: ExerciseContentMap[T]) => boolean;
}

const filled = (list: string[] | undefined, size: number) => Array.isArray(list) && list.length >= size && list.slice(0, size).every((s) => typeof s === "string" && s.trim() !== "");

/**
 * Nơi DUY NHẤT khai báo các dạng bài. Thêm dạng mới: tạo renderer, thêm kiểu vào types/exercise.ts
 * (ExerciseContentMap, ExerciseValueMap), rồi đăng ký một mục ở đây. Không cần sửa chỗ nào khác.
 */
export const EXERCISE_REGISTRY: { [T in AnswerableExerciseType]: ExerciseTypeDefinition<T> } = {
  multiple_choice: {
    label: "Trắc nghiệm",
    Renderer: MultipleChoice,
    emptyValue: (c) => (c.questions ?? []).map(() => -1),
    isAnswered: (v, c) => (c.questions ?? []).length > 0 && c.questions.every((_, i) => typeof v[i] === "number" && v[i] >= 0),
  },
  fill_blank: {
    label: "Điền từ",
    Renderer: FillBlank,
    emptyValue: (c) => Array.from({ length: countBlanks(c.text ?? "") }, () => ""),
    isAnswered: (v, c) => filled(v, countBlanks(c.text ?? "")) && countBlanks(c.text ?? "") > 0,
  },
  matching: {
    label: "Nối cặp",
    Renderer: Matching,
    emptyValue: () => [],
    isAnswered: (v, c) => (c.left ?? []).length > 0 && v.length === c.left.length,
  },
  error_correction: {
    label: "Sửa lỗi",
    Renderer: ErrorCorrection,
    emptyValue: () => [""],
    isAnswered: (v) => (v[0] ?? "").trim() !== "",
  },
  listening_fill: {
    label: "Nghe điền từ",
    Renderer: ListeningFill,
    emptyValue: (c) => Array.from({ length: Math.max(0, Math.floor(c.blanks ?? 0)) }, () => ""),
    isAnswered: (v, c) => c.blanks > 0 && filled(v, Math.floor(c.blanks)),
  },
  writing: {
    label: "Viết",
    Renderer: WritingEditor,
    emptyValue: () => ({ text: "" }),
    // Chặn nút gửi khi chưa đủ số từ tối thiểu
    isAnswered: (v, c) => (v.text ?? "").trim() !== "" && countWords(v.text) >= (c.minWords ?? 0),
  },
};

export const isAnswerableType = (type: string): type is AnswerableExerciseType => Object.prototype.hasOwnProperty.call(EXERCISE_REGISTRY, type);

export const emptyValueFor = <T extends AnswerableExerciseType>(type: T, content: ExerciseContentMap[T]): ExerciseValueMap[T] => EXERCISE_REGISTRY[type].emptyValue(content as never) as ExerciseValueMap[T];

export const isAnsweredFor = <T extends AnswerableExerciseType>(type: T, value: ExerciseValueMap[T], content: ExerciseContentMap[T]): boolean => EXERCISE_REGISTRY[type].isAnswered(value as never, content as never);

export const exerciseTypeLabel = (type: string) => (isAnswerableType(type) ? EXERCISE_REGISTRY[type].label : type);
