import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, CircleCheck, Loader2, Sparkles } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Notice from "../../account/Notice";
import { generateExercise } from "../../../api/exercises";
import { getErrorCode, getErrorMessage } from "../../../api/client";
import { LEVEL_OPTIONS, SKILL_OPTIONS } from "../../student/libraryFilters";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { TYPE_LABEL } from "../assignments/assignmentMeta";
import SelectField from "./form/SelectField";
import { TEACHER_EXERCISES_KEY } from "./useTeacherExercises";
import type { CefrLevel } from "../../../types/student";
import type { LibrarySkill } from "../../../types/library";
import type { ExerciseListItem, ExerciseTypeKey, GenerateExercisePayload } from "../../../types/exercise";

const TYPES: ExerciseTypeKey[] = ["multiple_choice", "fill_blank", "matching", "error_correction", "listening_fill", "writing", "speaking"];
const TYPE_OPTIONS = TYPES.map((value) => ({ value, label: TYPE_LABEL[value] }));
const LEVEL_SELECT_OPTIONS = LEVEL_OPTIONS.map((l) => ({ value: l, label: l }));

/** Kỹ năng hợp lệ theo dạng bài (backend chỉ nhận các cặp này). Chỉ có một lựa chọn thì tự chọn và khóa. */
const SKILLS_BY_TYPE: Record<ExerciseTypeKey, LibrarySkill[]> = {
  multiple_choice: ["READING"],
  fill_blank: ["FOUNDATION", "READING"],
  matching: ["FOUNDATION"],
  error_correction: ["WRITING", "FOUNDATION"],
  listening_fill: ["LISTENING"],
  writing: ["WRITING"],
  speaking: ["SPEAKING"],
};

/** Ô "số lượng" theo dạng bài; dạng không có thì ẩn ô và gửi count = 1 */
const COUNT_FIELD: Partial<Record<ExerciseTypeKey, { label: string; min: number; max: number }>> = {
  multiple_choice: { label: "Số câu hỏi", min: 1, max: 10 },
  fill_blank: { label: "Số chỗ trống", min: 1, max: 10 },
  listening_fill: { label: "Số chỗ trống", min: 1, max: 10 },
  matching: { label: "Số cặp", min: 2, max: 10 },
};

const TOPIC = { min: 2, max: 100 };
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

interface FieldErrors {
  topic?: string;
  count?: string;
}

function validate(topic: string, type: ExerciseTypeKey, countRaw: string): FieldErrors {
  const errors: FieldErrors = {};
  const t = topic.trim();
  if (!t) errors.topic = "Vui lòng nhập chủ đề";
  else if (CONTROL_CHARS.test(t)) errors.topic = "Chủ đề không được chứa ký tự điều khiển (xuống dòng, tab...)";
  else if (t.length < TOPIC.min) errors.topic = `Chủ đề cần ít nhất ${TOPIC.min} ký tự`;
  else if (t.length > TOPIC.max) errors.topic = `Chủ đề tối đa ${TOPIC.max} ký tự`;

  const field = COUNT_FIELD[type];
  if (field) {
    const v = countRaw.trim();
    const n = Number(v);
    if (!/^\d+$/.test(v) || n < field.min || n > field.max) errors.count = `${field.label} phải là số nguyên từ ${field.min} đến ${field.max}`;
  }
  return errors;
}

/** Gợi ý thân thiện theo mã trạng thái HTTP / mã lỗi của backend (thông báo gốc của máy chủ vẫn được hiện). */
function aiErrorHint(error: unknown): string | undefined {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined;
  const code = getErrorCode(error);
  if (status === 429 || code === "AI_QUOTA_EXCEEDED") return "Thầy/cô đã hết lượt dùng AI hôm nay. Hãy thử lại vào ngày mai.";
  if (status === 502 || code === "AI_INVALID_FORMAT") return "AI trả về nội dung chưa đúng định dạng. Hãy bấm “Nhờ AI sinh bài” để thử lại, có thể đổi chủ đề cho cụ thể hơn.";
  if (status === 503 || status === 504) return "AI đang bận hoặc phản hồi quá lâu. Hãy thử lại sau ít phút.";
  if (axios.isAxiosError(error) && !error.response && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) return "AI phản hồi quá lâu nên đã dừng chờ. Hãy thử lại sau ít phút.";
  return undefined;
}

/** /teacher/exercises/ai: nhờ AI soạn một bài tập (POST /exercises/generate). Bài sinh ra là bản nháp, giáo viên cần xem lại. */
export default function GenerateExercisePage() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<ExerciseTypeKey>("multiple_choice");
  const [skill, setSkill] = useState<LibrarySkill>("READING");
  const [level, setLevel] = useState<CefrLevel>("A1");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("5");
  const [submitted, setSubmitted] = useState(false);

  const skillChoices = SKILLS_BY_TYPE[type];
  const skillLocked = skillChoices.length === 1;
  const effectiveSkill = skillChoices.includes(skill) ? skill : skillChoices[0];
  const skillOptions = SKILL_OPTIONS.filter((o) => skillChoices.includes(o.value));
  const countField = COUNT_FIELD[type];
  const errors = submitted ? validate(topic, type, count) : {};

  const mutation = useMutation({
    mutationFn: generateExercise,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEACHER_EXERCISES_KEY });
    },
  });
  const pending = mutation.isPending;
  const result: ExerciseListItem | undefined = mutation.data;

  function changeType(next: ExerciseTypeKey) {
    setType(next);
    // Kỹ năng không còn hợp lệ với dạng mới thì chọn lại theo lựa chọn đầu tiên
    setSkill((cur) => (SKILLS_BY_TYPE[next].includes(cur) ? cur : SKILLS_BY_TYPE[next][0]));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (pending) return; // chặn gửi trùng
    setSubmitted(true);
    if (Object.keys(validate(topic, type, count)).length > 0) return;
    const body: GenerateExercisePayload = { skill: effectiveSkill, level, topic: topic.trim(), type, count: countField ? Number(count.trim()) : 1 };
    mutation.mutate(body);
  }

  function reset() {
    mutation.reset();
    setType("multiple_choice");
    setSkill("READING");
    setLevel("A1");
    setTopic("");
    setCount("5");
    setSubmitted(false);
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
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Nhờ AI sinh bài</h1>
      <p className="mt-2 text-slate-500">Chọn dạng bài, cấp độ và chủ đề, AI sẽ soạn một bài tập và lưu vào Bản nháp để thầy/cô xem lại.</p>

      {result ? (
        <section className="mt-8 rounded-3xl border border-green-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="gen-done">
          <h2 id="gen-done" className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900">
            <CircleCheck className="size-6 text-green-600" aria-hidden="true" />
            AI đã soạn xong bài
          </h2>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Chủ đề</dt>
              <dd className="mt-1 font-bold text-slate-900">{result.topic}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Dạng bài</dt>
              <dd className="mt-1 font-bold text-slate-900">{TYPE_LABEL[result.type] ?? result.type}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Kỹ năng</dt>
              <dd className="mt-1 font-bold text-slate-900">{ANY_SKILL_META[result.skill]?.label ?? result.skill}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Cấp độ</dt>
              <dd className="mt-1 font-bold text-slate-900">{result.level}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            Đây là bản nháp do AI soạn. Thầy/cô cần xem lại nội dung và đáp án trước khi dùng cho học sinh.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button to={`/teacher/exercises/${result.id}/review`}>Xem và chỉnh bản nháp</Button>
            <Button variant="outline" onClick={reset}>
              Sinh bài khác
            </Button>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} noValidate className="mt-8 space-y-6">
          <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <legend className="sr-only">Thông tin bài cần sinh</legend>
            <div className="grid gap-5 sm:grid-cols-3">
              <SelectField label="Dạng bài" value={type} options={TYPE_OPTIONS} onChange={changeType} />
              <SelectField
                label="Kỹ năng"
                value={effectiveSkill}
                options={skillOptions}
                disabled={skillLocked}
                hint={skillLocked ? "Kỹ năng được cố định theo dạng bài." : undefined}
                onChange={setSkill}
              />
              <SelectField label="Cấp độ" value={level} options={LEVEL_SELECT_OPTIONS} onChange={setLevel} />
            </div>

            <div>
              <Input label="Chủ đề" placeholder="Ví dụ: Daily routines" autoComplete="off" value={topic} error={errors.topic} onChange={(e) => setTopic(e.target.value)} />
              {!errors.topic && <p className="mt-1.5 text-xs text-slate-500">Không nhập tên thật hoặc thông tin cá nhân của học sinh vào chủ đề.</p>}
            </div>

            {countField && (
              <Input
                className="max-w-56"
                label={countField.label}
                type="number"
                inputMode="numeric"
                min={countField.min}
                max={countField.max}
                value={count}
                error={errors.count}
                onChange={(e) => setCount(e.target.value)}
              />
            )}
          </fieldset>

          {pending && (
            <p role="status" aria-live="polite" className="flex items-center gap-2 rounded-2xl bg-brand-light p-4 text-sm font-semibold text-brand-dark">
              <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
              AI đang soạn bài, có thể mất 10–30 giây…
            </p>
          )}

          {mutation.isError && (
            <div className="space-y-3">
              <Notice type="error">{getErrorMessage(mutation.error, "Không sinh được bài, vui lòng thử lại.")}</Notice>
              {aiErrorHint(mutation.error) && <Notice type="warning">{aiErrorHint(mutation.error) as string}</Notice>}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" to="/teacher/exercises" disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" leftIcon={<Sparkles />} disabled={pending} aria-busy={pending || undefined}>
              {pending ? "AI đang soạn…" : "Nhờ AI sinh bài"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
