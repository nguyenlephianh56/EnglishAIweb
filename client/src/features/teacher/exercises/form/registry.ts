import { TYPE_LABEL } from "../../assignments/assignmentMeta";
import ErrorCorrectionEditor from "./ErrorCorrectionEditor";
import FillBlankEditor from "./FillBlankEditor";
import ListeningFillEditor from "./ListeningFillEditor";
import MatchingEditor from "./MatchingEditor";
import MultipleChoiceEditor from "./MultipleChoiceEditor";
import SpeakingPromptEditor from "./SpeakingPromptEditor";
import WritingPromptEditor from "./WritingPromptEditor";
import { ecBuild, ecInitial, ecValidate, fbBuild, fbInitial, fbValidate, lfBuild, lfInitial, lfValidate, mcBuild, mcInitial, mcValidate, mtBuild, mtInitial, mtValidate, spBuild, spInitial, spValidate, wrBuild, wrInitial, wrValidate } from "./logic";
import type { ExerciseTypeKey } from "../../../../types/exercise";
import type { BuiltExercise, FieldErrors, FormRegistry, StateMap } from "./types";

/** Dạng bài -> nhãn, kỹ năng bị khóa (nếu có), editor, trạng thái ban đầu, kiểm tra và dựng body gửi backend. */
export const FORM_REGISTRY: FormRegistry = {
  multiple_choice: { label: TYPE_LABEL.multiple_choice, editor: MultipleChoiceEditor, initial: mcInitial, validate: mcValidate, build: mcBuild },
  fill_blank: { label: TYPE_LABEL.fill_blank, editor: FillBlankEditor, initial: fbInitial, validate: fbValidate, build: fbBuild },
  matching: { label: TYPE_LABEL.matching, editor: MatchingEditor, initial: mtInitial, validate: mtValidate, build: mtBuild },
  error_correction: { label: TYPE_LABEL.error_correction, editor: ErrorCorrectionEditor, initial: ecInitial, validate: ecValidate, build: ecBuild },
  listening_fill: { label: TYPE_LABEL.listening_fill, skill: "LISTENING", editor: ListeningFillEditor, initial: lfInitial, validate: lfValidate, build: lfBuild },
  writing: { label: TYPE_LABEL.writing, skill: "WRITING", editor: WritingPromptEditor, initial: wrInitial, validate: wrValidate, build: wrBuild },
  speaking: { label: TYPE_LABEL.speaking, skill: "SPEAKING", editor: SpeakingPromptEditor, initial: spInitial, validate: spValidate, build: spBuild },
};

export const FORM_TYPES = Object.keys(FORM_REGISTRY) as ExerciseTypeKey[];
export const FORM_TYPE_OPTIONS = FORM_TYPES.map((value) => ({ value, label: FORM_REGISTRY[value].label }));

// Các hàm generic để gọi theo `type` mà không cần switch: TypeScript tự khớp kiểu state với dạng bài.
export const initialState = <T extends ExerciseTypeKey>(type: T): StateMap[T] => FORM_REGISTRY[type].initial();
export const validateState = <T extends ExerciseTypeKey>(type: T, state: StateMap[T]): FieldErrors => FORM_REGISTRY[type].validate(state);
export const buildState = <T extends ExerciseTypeKey>(type: T, state: StateMap[T]): BuiltExercise => FORM_REGISTRY[type].build(state);
