import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Textarea from "../../../components/ui/Textarea";
import Notice from "../../account/Notice";
import { createExercise } from "../../../api/exercises";
import { getErrorMessage } from "../../../api/client";
import { LEVEL_OPTIONS, SKILL_OPTIONS } from "../../student/libraryFilters";
import SelectField from "./form/SelectField";
import { buildState, FORM_REGISTRY, FORM_TYPE_OPTIONS, initialState, validateState } from "./form/registry";
import { LIMITS } from "./form/types";
import type { FieldErrors, StateMap } from "./form/types";
import { checkText } from "./form/helpers";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";
import type { CefrLevel } from "../../../types/student";
import type { LibrarySkill } from "../../../types/library";
import type { CreateExercisePayload, ExerciseTypeKey } from "../../../types/exercise";

const LEVEL_SELECT_OPTIONS = LEVEL_OPTIONS.map((l) => ({ value: l, label: l }));

/** Editor của đúng dạng bài đang chọn, lấy từ registry (không if/switch theo dạng). */
function TypeEditor<T extends ExerciseTypeKey>({ type, state, onChange, errors }: { type: T; state: StateMap[T]; onChange: (next: StateMap[T]) => void; errors: FieldErrors }) {
  const Editor = FORM_REGISTRY[type].editor;
  return <Editor state={state} onChange={onChange} errors={errors} />;
}

/** /teacher/exercises/new: tạo bài tập mới (POST /exercises). Bài mới luôn lưu ở trạng thái nháp. */
export default function NewExercisePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formRef = useRef<HTMLFormElement>(null);

  const [type, setType] = useState<ExerciseTypeKey>("multiple_choice");
  const [skill, setSkill] = useState<LibrarySkill>("READING");
  const [level, setLevel] = useState<CefrLevel>("A1");
  const [topic, setTopic] = useState("");
  const [explanation, setExplanation] = useState("");
  // Mỗi dạng giữ dữ liệu nhập riêng: đổi dạng rồi quay lại không mất bài đang soạn
  const [states, setStates] = useState<Partial<StateMap>>({});
  const [submitted, setSubmitted] = useState(false);

  const lockedSkill = FORM_REGISTRY[type].skill;
  const effectiveSkill = lockedSkill ?? skill;
  const state = (states[type] ?? initialState(type)) as StateMap[typeof type];

  // Chỉ báo lỗi sau lần bấm Lưu đầu tiên; từ đó lỗi cập nhật theo từng lần gõ
  const errors: FieldErrors = submitted ? validateAll() : {};

  function validateAll(): FieldErrors {
    const common: FieldErrors = {};
    checkText(common, "topic", topic, "chủ đề", LIMITS.topic);
    checkText(common, "explanation", explanation, "lời giải thích", LIMITS.explanation, false);
    return { ...common, ...validateState(type, state) };
  }

  const mutation = useMutation({
    mutationFn: createExercise,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: TEACHER_EXERCISES_KEY });
      navigate("/teacher/exercises?tab=draft");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(validateAll()).length > 0) {
      // Chờ React vẽ lỗi rồi đưa con trỏ tới ô lỗi đầu tiên
      window.requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.scrollIntoView({ block: "center" });
        first?.focus({ preventScroll: true });
      });
      return;
    }
    const built = buildState(type, state);
    const body: CreateExercisePayload = { type, skill: effectiveSkill, level, topic: topic.trim(), content: built.content };
    if (built.answer !== undefined) body.answer = built.answer;
    if (explanation.trim()) body.explanation = explanation.trim();
    mutation.mutate(body);
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <Link
        to="/teacher/exercises"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Ngân hàng bài tập
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tạo bài tập mới</h1>
      <p className="mt-2 text-slate-500">Soạn bài theo dạng bạn chọn. Bài mới được lưu vào tab “Bản nháp”.</p>

      <form ref={formRef} onSubmit={submit} noValidate className="mt-8 space-y-6">
        <fieldset disabled={mutation.isPending} className="m-0 min-w-0 space-y-6 border-0 p-0">
          <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="ex-general">
            <h2 id="ex-general" className="font-heading text-lg font-bold text-slate-900">
              Thông tin chung
            </h2>
            <div className="grid gap-5 sm:grid-cols-3">
              <SelectField label="Dạng bài" value={type} options={FORM_TYPE_OPTIONS} onChange={setType} />
              <SelectField
                label="Kỹ năng"
                value={effectiveSkill}
                options={SKILL_OPTIONS}
                disabled={lockedSkill !== undefined}
                hint={lockedSkill ? "Kỹ năng được cố định theo dạng bài." : undefined}
                onChange={setSkill}
              />
              <SelectField label="Cấp độ" value={level} options={LEVEL_SELECT_OPTIONS} onChange={setLevel} />
            </div>
            <Input label="Chủ đề" placeholder="Ví dụ: Daily routines" value={topic} error={errors.topic} onChange={(e) => setTopic(e.target.value)} />
            <Textarea
              label="Lời giải thích (không bắt buộc)"
              hint="Học sinh xem phần này cùng đáp án sau khi làm bài."
              limit={LIMITS.explanation}
              rows={3}
              value={explanation}
              error={errors.explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="ex-content">
            <h2 id="ex-content" className="mb-5 font-heading text-lg font-bold text-slate-900">
              Nội dung: {FORM_REGISTRY[type].label}
            </h2>
            <TypeEditor key={type} type={type} state={state} errors={errors} onChange={(next) => setStates((prev) => ({ ...prev, [type]: next }) as Partial<StateMap>)} />
          </section>
        </fieldset>

        {submitted && Object.keys(errors).length > 0 && <Notice type="error">Còn thông tin chưa hợp lệ. Hãy kiểm tra các ô báo đỏ bên trên.</Notice>}
        {mutation.isError && <Notice type="error">{getErrorMessage(mutation.error, "Không lưu được bài tập, vui lòng thử lại.")}</Notice>}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" to="/teacher/exercises" disabled={mutation.isPending}>
            Hủy
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Lưu bản nháp
          </Button>
        </div>
      </form>
    </div>
  );
}
