import { useRef } from "react";
import type { FormEvent } from "react";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import Notice from "../../../account/Notice";
import { LEVEL_OPTIONS, SKILL_OPTIONS } from "../../../student/libraryFilters";
import { focusFirstInvalid } from "./focus";
import { FORM_REGISTRY, FORM_TYPE_OPTIONS } from "./registry";
import SelectField from "./SelectField";
import { LIMITS } from "./types";
import type { ExerciseFormController } from "./useExerciseForm";
import type { FieldErrors, FormMode, StateMap } from "./types";
import type { ExerciseTypeKey } from "../../../../types/exercise";

const LEVEL_SELECT_OPTIONS = LEVEL_OPTIONS.map((l) => ({ value: l, label: l }));

/** Editor của đúng dạng bài đang chọn, lấy từ registry (không if/switch theo dạng). */
function TypeEditor<T extends ExerciseTypeKey>({ type, state, onChange, errors }: { type: T; state: StateMap[T]; onChange: (next: StateMap[T]) => void; errors: FieldErrors }) {
  const Editor = FORM_REGISTRY[type].editor;
  return <Editor state={state} onChange={onChange} errors={errors} />;
}

interface ExerciseFormProps {
  mode: FormMode;
  form: ExerciseFormController;
  /** Đang gửi lên máy chủ: khóa mọi ô */
  pending: boolean;
  /** Lỗi từ máy chủ (giá trị trong form được giữ nguyên) */
  error?: string;
  /** Gọi sau khi kiểm tra hợp lệ ở client */
  onSubmit: () => void;
  submitLabel?: string;
  /** Ẩn thanh nút mặc định (trang cha tự vẽ các nút, ví dụ trang xem lại bản nháp) */
  hideActions?: boolean;
  cancelTo?: string;
}

/**
 * Form bài tập dùng chung: mode "create" (tạo mới) và "edit" (sửa bài đã có, dạng bài chỉ đọc).
 * Trạng thái nằm ở `form` (useExerciseForm) để trang cha đọc được giá trị, thay đổi và gọi lưu.
 */
export default function ExerciseForm({ mode, form, pending, error, onSubmit, submitLabel, hideActions, cancelTo = "/teacher/exercises" }: ExerciseFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const hasErrors = Object.keys(form.errors).length > 0;
  const skillOptions = SKILL_OPTIONS;

  function submit(e: FormEvent) {
    e.preventDefault();
    form.showErrors();
    if (Object.keys(form.validateAll()).length > 0) {
      focusFirstInvalid(formRef.current);
      return;
    }
    if (!pending) onSubmit();
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="ex-general">
          <h2 id="ex-general" className="font-heading text-lg font-bold text-slate-900">
            Thông tin chung
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <SelectField
              label="Dạng bài"
              value={form.type}
              options={FORM_TYPE_OPTIONS}
              disabled={mode === "edit"}
              hint={mode === "edit" ? "Không đổi được dạng bài sau khi tạo." : undefined}
              onChange={form.setType}
            />
            <SelectField
              label="Kỹ năng"
              value={form.skill}
              options={skillOptions}
              disabled={form.skillLocked}
              hint={form.skillLocked ? "Kỹ năng được cố định theo dạng bài." : undefined}
              onChange={form.setSkill}
            />
            <SelectField label="Cấp độ" value={form.level} options={LEVEL_SELECT_OPTIONS} onChange={form.setLevel} />
          </div>
          <Input label="Chủ đề" placeholder="Ví dụ: Daily routines" value={form.topic} error={form.errors.topic} onChange={(e) => form.setTopic(e.target.value)} />
          <Textarea
            label="Lời giải thích (không bắt buộc)"
            hint="Học sinh xem phần này cùng đáp án sau khi làm bài."
            limit={LIMITS.explanation}
            rows={3}
            value={form.explanation}
            error={form.errors.explanation}
            onChange={(e) => form.setExplanation(e.target.value)}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="ex-content">
          <h2 id="ex-content" className="mb-5 font-heading text-lg font-bold text-slate-900">
            Nội dung: {FORM_REGISTRY[form.type].label}
          </h2>
          <TypeEditor key={form.type} type={form.type} state={form.state} errors={form.errors} onChange={form.setState} />
        </section>
      </fieldset>

      {hasErrors && <Notice type="error">Còn thông tin chưa hợp lệ. Hãy kiểm tra các ô báo đỏ bên trên.</Notice>}
      {error && <Notice type="error">{error}</Notice>}

      {!hideActions && (
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" to={cancelTo} disabled={pending}>
            Hủy
          </Button>
          <Button type="submit" loading={pending}>
            {submitLabel ?? "Lưu"}
          </Button>
        </div>
      )}
    </form>
  );
}
