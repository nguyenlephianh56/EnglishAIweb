import { useRef, useState } from "react";
import { checkText } from "./helpers";
import { deepEqual } from "./parse";
import { buildState, FORM_REGISTRY, initialState, isFormType, parseState, validateState } from "./registry";
import { LIMITS } from "./types";
import type { FieldErrors, FormMode, StateMap } from "./types";
import type { CefrLevel } from "../../../../types/student";
import type { LibrarySkill } from "../../../../types/library";
import type { CreateExercisePayload, ExerciseListItem, ExerciseTypeKey, UpdateExercisePayload } from "../../../../types/exercise";

/** Ảnh chụp giá trị đã chuẩn hóa (trim, dựng content/answer đúng dạng gửi backend) để so sánh thay đổi */
export interface FormSnapshot {
  topic: string;
  skill: LibrarySkill;
  level: CefrLevel;
  explanation: string;
  content: unknown;
  answer: unknown;
}

export interface ExerciseFormController {
  mode: FormMode;
  type: ExerciseTypeKey;
  setType: (t: ExerciseTypeKey) => void;
  /** Kỹ năng đang áp dụng (đã tính khóa theo dạng bài) */
  skill: LibrarySkill;
  skillLocked: boolean;
  setSkill: (s: LibrarySkill) => void;
  level: CefrLevel;
  setLevel: (l: CefrLevel) => void;
  topic: string;
  setTopic: (v: string) => void;
  explanation: string;
  setExplanation: (v: string) => void;
  /** Trạng thái nhập liệu của dạng bài đang chọn */
  state: StateMap[ExerciseTypeKey];
  setState: (next: StateMap[ExerciseTypeKey]) => void;
  /** Lỗi từng ô; chỉ có sau khi gọi showErrors() */
  errors: FieldErrors;
  showErrors: () => void;
  validateAll: () => FieldErrors;
  snapshot: () => FormSnapshot;
  buildCreateBody: () => CreateExercisePayload;
  /** Chế độ sửa: chỉ những field khác bản đã lưu (rỗng nếu không đổi gì) */
  changes: () => UpdateExercisePayload;
  dirty: boolean;
  /** Sau khi lưu thành công: coi giá trị hiện tại là bản đã lưu */
  markSaved: () => void;
}

function makeSnapshot(type: ExerciseTypeKey, skill: LibrarySkill, level: CefrLevel, topic: string, explanation: string, state: StateMap[ExerciseTypeKey]): FormSnapshot {
  const built = buildState(type, state);
  return { topic: topic.trim(), skill: FORM_REGISTRY[type].skill ?? skill, level, explanation: explanation.trim(), content: built.content, answer: built.answer };
}

/**
 * Toàn bộ trạng thái của form bài tập, dùng chung cho tạo mới (create) và sửa (edit).
 * Chế độ sửa: nạp sẵn từ `exercise` (content/answer qua fromExercise của registry) và theo dõi thay đổi so với bản đã lưu.
 */
export function useExerciseForm(mode: FormMode, exercise?: ExerciseListItem): ExerciseFormController {
  // Chỉ nạp sẵn khi đang sửa và dạng bài có trong registry
  const src = mode === "edit" && exercise !== undefined && isFormType(exercise.type) ? exercise : undefined;
  const initType: ExerciseTypeKey = src && isFormType(src.type) ? src.type : "multiple_choice";

  const [type, setTypeRaw] = useState<ExerciseTypeKey>(initType);
  const [skill, setSkillRaw] = useState<LibrarySkill>(exercise?.skill ?? "READING");
  const [level, setLevel] = useState<CefrLevel>(exercise?.level ?? "A1");
  const [topic, setTopic] = useState(exercise?.topic ?? "");
  const [explanation, setExplanation] = useState(exercise?.explanation ?? "");
  // Mỗi dạng giữ dữ liệu nhập riêng: đổi dạng rồi quay lại không mất bài đang soạn
  const [states, setStates] = useState<Partial<StateMap>>(() => (src ? ({ [initType]: parseState(initType, src.content, src.answer) } as Partial<StateMap>) : {}));
  const [submitted, setSubmitted] = useState(false);

  const def = FORM_REGISTRY[type];
  const effectiveSkill = def.skill ?? skill;
  const state = (states[type] ?? initialState(type)) as StateMap[ExerciseTypeKey];

  const snapshot = () => makeSnapshot(type, skill, level, topic, explanation, state);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  // Bản đã lưu: dựng bằng cùng đường đi (parse -> build) nên khác biệt nhỏ về cách lưu (thứ tự cột nối cặp...) không bị tính là thay đổi
  const [baseline, setBaseline] = useState<FormSnapshot | null>(() =>
    src ? makeSnapshot(initType, src.skill, src.level, src.topic, src.explanation ?? "", parseState(initType, src.content, src.answer)) : null
  );

  function validateAll(): FieldErrors {
    const common: FieldErrors = {};
    checkText(common, "topic", topic, "chủ đề", LIMITS.topic);
    checkText(common, "explanation", explanation, "lời giải thích", LIMITS.explanation, false);
    return { ...common, ...validateState(type, state) };
  }

  function changes(): UpdateExercisePayload {
    const out: UpdateExercisePayload = {};
    if (!baseline) return out;
    const cur = snapshot();
    if (cur.topic !== baseline.topic) out.topic = cur.topic;
    if (cur.skill !== baseline.skill) out.skill = cur.skill;
    if (cur.level !== baseline.level) out.level = cur.level;
    if (cur.explanation !== baseline.explanation) out.explanation = cur.explanation === "" ? null : cur.explanation;
    if (!deepEqual(cur.content, baseline.content)) out.content = cur.content;
    // Viết và Nói không có answer: không bao giờ gửi
    if (cur.answer !== undefined && !deepEqual(cur.answer, baseline.answer)) out.answer = cur.answer;
    return out;
  }

  return {
    mode,
    type,
    setType: (t) => {
      setTypeRaw(t);
      // Kỹ năng không còn hợp lệ với dạng mới (bị khóa theo dạng) thì quay về mặc định
      if (FORM_REGISTRY[t].skill === undefined && FORM_REGISTRY[type].skill !== undefined) setSkillRaw("READING");
    },
    skill: effectiveSkill,
    skillLocked: def.skill !== undefined,
    setSkill: setSkillRaw,
    level,
    setLevel,
    topic,
    setTopic,
    explanation,
    setExplanation,
    state,
    setState: (next) => setStates((prev) => ({ ...prev, [type]: next }) as Partial<StateMap>),
    errors: submitted ? validateAll() : {},
    showErrors: () => setSubmitted(true),
    validateAll,
    snapshot,
    buildCreateBody: () => {
      const cur = snapshot();
      const body: CreateExercisePayload = { type, skill: cur.skill, level: cur.level, topic: cur.topic, content: cur.content };
      if (cur.answer !== undefined) body.answer = cur.answer;
      if (cur.explanation) body.explanation = cur.explanation;
      return body;
    },
    changes,
    dirty: baseline !== null && Object.keys(changes()).length > 0,
    markSaved: () => setBaseline(latest.current()),
  };
}
