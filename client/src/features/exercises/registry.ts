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
  /** Đơn vị đếm tiến độ: "câu", "chỗ trống", "cặp", "từ" */
  unit: string;
  /** Tiến độ làm bài: đã làm `done` trên tổng `total` (đơn vị theo `unit`) */
  progress: (value: ExerciseValueMap[T], content: ExerciseContentMap[T]) => { done: number; total: number };
  /** Cho nộp khi còn bỏ trống (sau khi xác nhận)? Bài Viết thì không: phải đủ số từ tối thiểu. */
  allowPartialSubmit: boolean;
  /** Đổi value thành body `answer` gửi backend (ví dụ trắc nghiệm: -1 -> null vì backend không nhận số âm) */
  toPayload: (value: ExerciseValueMap[T]) => unknown;
  /** Ngược lại: đọc bài làm đã nộp (submittedAnswer) về value để hiện lại; dữ liệu hỏng thì trả giá trị rỗng */
  fromPayload: (raw: unknown, content: ExerciseContentMap[T]) => ExerciseValueMap[T];
}

const asArray = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : []);
const asStrings = (raw: unknown, size: number): string[] => Array.from({ length: size }, (_, i) => (typeof asArray(raw)[i] === "string" ? (asArray(raw)[i] as string) : ""));
const nonEmptyCount = (list: string[], size: number) => list.slice(0, size).filter((s) => typeof s === "string" && s.trim() !== "").length;

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
    unit: "câu",
    progress: (v, c) => ({ done: (c.questions ?? []).filter((_, i) => typeof v[i] === "number" && v[i] >= 0).length, total: (c.questions ?? []).length }),
    allowPartialSubmit: true,
    toPayload: (v) => v.map((n) => (typeof n === "number" && n >= 0 ? n : null)),
    fromPayload: (raw, c) => (c.questions ?? []).map((_, i) => (typeof asArray(raw)[i] === "number" ? (asArray(raw)[i] as number) : -1)),
  },
  fill_blank: {
    label: "Điền từ",
    Renderer: FillBlank,
    emptyValue: (c) => Array.from({ length: countBlanks(c.text ?? "") }, () => ""),
    isAnswered: (v, c) => filled(v, countBlanks(c.text ?? "")) && countBlanks(c.text ?? "") > 0,
    unit: "chỗ trống",
    progress: (v, c) => ({ done: nonEmptyCount(v, countBlanks(c.text ?? "")), total: countBlanks(c.text ?? "") }),
    allowPartialSubmit: true,
    toPayload: (v) => v,
    fromPayload: (raw, c) => asStrings(raw, countBlanks(c.text ?? "")),
  },
  matching: {
    label: "Nối cặp",
    Renderer: Matching,
    emptyValue: () => [],
    isAnswered: (v, c) => (c.left ?? []).length > 0 && v.length === c.left.length,
    unit: "cặp",
    progress: (v, c) => ({ done: Math.min(v.length, (c.left ?? []).length), total: (c.left ?? []).length }),
    allowPartialSubmit: true,
    toPayload: (v) => v,
    fromPayload: (raw) =>
      asArray(raw).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number"),
  },
  error_correction: {
    label: "Sửa lỗi",
    Renderer: ErrorCorrection,
    emptyValue: () => [""],
    isAnswered: (v) => (v[0] ?? "").trim() !== "",
    unit: "câu",
    progress: (v) => ({ done: (v[0] ?? "").trim() !== "" ? 1 : 0, total: 1 }),
    allowPartialSubmit: true,
    toPayload: (v) => v,
    fromPayload: (raw) => asStrings(raw, 1),
  },
  listening_fill: {
    label: "Nghe điền từ",
    Renderer: ListeningFill,
    emptyValue: (c) => Array.from({ length: Math.max(0, Math.floor(c.blanks ?? 0)) }, () => ""),
    isAnswered: (v, c) => c.blanks > 0 && filled(v, Math.floor(c.blanks)),
    unit: "chỗ trống",
    progress: (v, c) => ({ done: nonEmptyCount(v, Math.floor(c.blanks ?? 0)), total: Math.floor(c.blanks ?? 0) }),
    allowPartialSubmit: true,
    toPayload: (v) => v,
    fromPayload: (raw, c) => asStrings(raw, Math.floor(c.blanks ?? 0)),
  },
  writing: {
    label: "Viết",
    Renderer: WritingEditor,
    emptyValue: () => ({ text: "" }),
    // Chặn nút gửi khi chưa đủ số từ tối thiểu
    isAnswered: (v, c) => (v.text ?? "").trim() !== "" && countWords(v.text) >= (c.minWords ?? 0),
    unit: "từ",
    progress: (v, c) => {
      const total = (c.minWords ?? 0) > 0 ? c.minWords : 1;
      return { done: Math.min(countWords(v.text ?? ""), total), total };
    },
    allowPartialSubmit: false,
    toPayload: (v) => ({ text: v.text }),
    fromPayload: (raw) => ({ text: raw && typeof raw === "object" && typeof (raw as { text?: unknown }).text === "string" ? (raw as { text: string }).text : "" }),
  },
};

export const isAnswerableType = (type: string): type is AnswerableExerciseType => Object.prototype.hasOwnProperty.call(EXERCISE_REGISTRY, type);

export const emptyValueFor = <T extends AnswerableExerciseType>(type: T, content: ExerciseContentMap[T]): ExerciseValueMap[T] => EXERCISE_REGISTRY[type].emptyValue(content as never) as ExerciseValueMap[T];

export const isAnsweredFor = <T extends AnswerableExerciseType>(type: T, value: ExerciseValueMap[T], content: ExerciseContentMap[T]): boolean => EXERCISE_REGISTRY[type].isAnswered(value as never, content as never);

export const exerciseTypeLabel = (type: string) => (isAnswerableType(type) ? EXERCISE_REGISTRY[type].label : type);

export const progressFor = <T extends AnswerableExerciseType>(type: T, value: ExerciseValueMap[T], content: ExerciseContentMap[T]) =>
  EXERCISE_REGISTRY[type].progress(value as never, content as never);

export const toPayloadFor = <T extends AnswerableExerciseType>(type: T, value: ExerciseValueMap[T]): unknown => EXERCISE_REGISTRY[type].toPayload(value as never);

export const fromPayloadFor = <T extends AnswerableExerciseType>(type: T, raw: unknown, content: ExerciseContentMap[T]): ExerciseValueMap[T] =>
  EXERCISE_REGISTRY[type].fromPayload(raw, content as never) as ExerciseValueMap[T];
