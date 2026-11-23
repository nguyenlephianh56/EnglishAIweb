import { TYPE_LABEL } from "../../assignments/assignmentMeta";
import ErrorCorrectionEditor from "./ErrorCorrectionEditor";
import FillBlankEditor from "./FillBlankEditor";
import ListeningFillEditor from "./ListeningFillEditor";
import MatchingEditor from "./MatchingEditor";
import MultipleChoiceEditor from "./MultipleChoiceEditor";
import SpeakingPromptEditor from "./SpeakingPromptEditor";
import WritingPromptEditor from "./WritingPromptEditor";
import {
  ecBuild, ecFrom, ecInitial, ecValidate,
  fbBuild, fbFrom, fbInitial, fbValidate,
  lfBuild, lfFrom, lfInitial, lfValidate,
  mcBuild, mcFrom, mcInitial, mcValidate,
  mtBuild, mtFrom, mtInitial, mtValidate,
  spBuild, spFrom, spInitial, spValidate,
  wrBuild, wrFrom, wrInitial, wrValidate,
} from "./logic";
import type { ExerciseTypeKey } from "../../../../types/exercise";
import type { BuiltExercise, FieldErrors, FormRegistry, StateMap } from "./types";

/** Dạng bài -> nhãn, kỹ năng bị khóa (nếu có), editor, trạng thái ban đầu, kiểm tra và dựng body gửi backend. */
export const FORM_REGISTRY: FormRegistry = {
  multiple_choice: { label: TYPE_LABEL.multiple_choice, editor: MultipleChoiceEditor, initial: mcInitial, fromExercise: mcFrom, validate: mcValidate, build: mcBuild },
  fill_blank: { label: TYPE_LABEL.fill_blank, editor: FillBlankEditor, initial: fbInitial, fromExercise: fbFrom, validate: fbValidate, build: fbBuild },
  matching: { label: TYPE_LABEL.matching, editor: MatchingEditor, initial: mtInitial, fromExercise: mtFrom, validate: mtValidate, build: mtBuild },
  error_correction: { label: TYPE_LABEL.error_correction, editor: ErrorCorrectionEditor, initial: ecInitial, fromExercise: ecFrom, validate: ecValidate, build: ecBuild },
  listening_fill: { label: TYPE_LABEL.listening_fill, skill: "LISTENING", editor: ListeningFillEditor, initial: lfInitial, fromExercise: lfFrom, validate: lfValidate, build: lfBuild },
  writing: { label: TYPE_LABEL.writing, skill: "WRITING", editor: WritingPromptEditor, initial: wrInitial, fromExercise: wrFrom, validate: wrValidate, build: wrBuild },
  speaking: { label: TYPE_LABEL.speaking, skill: "SPEAKING", editor: SpeakingPromptEditor, initial: spInitial, fromExercise: spFrom, validate: spValidate, build: spBuild },
};

export const FORM_TYPES = Object.keys(FORM_REGISTRY) as ExerciseTypeKey[];
export const FORM_TYPE_OPTIONS = FORM_TYPES.map((value) => ({ value, label: FORM_REGISTRY[value].label }));

// Các hàm generic để gọi theo `type` mà không cần switch: TypeScript tự khớp kiểu state với dạng bài.
export const initialState = <T extends ExerciseTypeKey>(type: T): StateMap[T] => FORM_REGISTRY[type].initial();
export const validateState = <T extends ExerciseTypeKey>(type: T, state: StateMap[T]): FieldErrors => FORM_REGISTRY[type].validate(state);
export const buildState = <T extends ExerciseTypeKey>(type: T, state: StateMap[T]): BuiltExercise => FORM_REGISTRY[type].build(state);

/** Dạng bài có hỗ trợ trong form không (dữ liệu từ backend có thể có dạng lạ) */
export const isFormType = (type: string): type is ExerciseTypeKey => Object.prototype.hasOwnProperty.call(FORM_REGISTRY, type);
export const parseState = <T extends ExerciseTypeKey>(type: T, content: unknown, answer: unknown): StateMap[T] => FORM_REGISTRY[type].fromExercise(content, answer);
