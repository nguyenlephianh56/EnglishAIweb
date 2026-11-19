import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import IconButton from "./IconButton";
import { newQuestion } from "./logic";
import { optionLetter, removeAt, replaceAt } from "./helpers";
import { LIMITS } from "./types";
import type { EditorProps, MultipleChoiceState } from "./types";

type Question = MultipleChoiceState["questions"][number];

/** Trắc nghiệm: đoạn văn (tùy chọn), 1–20 câu, mỗi câu 2–6 lựa chọn và một đáp án đúng (nút chọn). */
export default function MultipleChoiceEditor({ state, onChange, errors }: EditorProps<MultipleChoiceState>) {
  const uid = useId();
  const patchQuestion = (i: number, patch: Partial<Question>) => onChange({ ...state, questions: replaceAt(state.questions, i, { ...state.questions[i], ...patch }) });

  function removeOption(i: number, j: number) {
    const q = state.questions[i];
    // Xóa lựa chọn đứng trước đáp án đúng thì đáp án đúng dịch lên; xóa chính nó thì bỏ chọn
    const correct = q.correct === j ? -1 : q.correct > j ? q.correct - 1 : q.correct;
    patchQuestion(i, { options: removeAt(q.options, j), correct });
  }

  return (
    <div className="space-y-6">
      <Textarea
        label="Đoạn văn (không bắt buộc)"
        hint="Dùng cho bài đọc hiểu: đoạn văn hiện phía trên các câu hỏi."
        limit={LIMITS.longText}
        rows={5}
        value={state.passage}
        error={errors.passage}
        onChange={(e) => onChange({ ...state, passage: e.target.value })}
      />

      <div className="space-y-5">
        {state.questions.map((q, i) => {
          const correctKey = `questions.${i}.correct`;
          return (
            <fieldset key={i} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <legend className="px-2 text-sm font-bold text-brand">Câu {i + 1}</legend>
              <div className="flex items-start gap-2">
                <Input
                  className="flex-1"
                  label={`Câu hỏi ${i + 1}`}
                  placeholder="Nhập câu hỏi"
                  value={q.q}
                  error={errors[`questions.${i}.q`]}
                  onChange={(e) => patchQuestion(i, { q: e.target.value })}
                />
                <div className="mt-7">
                  <IconButton label={`Xóa câu ${i + 1}`} disabled={state.questions.length <= LIMITS.questions.min} onClick={() => onChange({ ...state, questions: removeAt(state.questions, i) })}>
                    <Trash2 />
                  </IconButton>
                </div>
              </div>

              <p className="mb-2 mt-4 text-sm font-bold text-slate-900">Các lựa chọn (chọn nút tròn ở đáp án đúng)</p>
              <div className="space-y-3" role="radiogroup" aria-label={`Đáp án đúng của câu ${i + 1}`}>
                {q.options.map((o, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name={`${uid}-correct-${i}`}
                      checked={q.correct === j}
                      aria-label={`Chọn lựa chọn ${optionLetter(j)} là đáp án đúng của câu ${i + 1}`}
                      aria-invalid={errors[correctKey] ? true : undefined}
                      onChange={() => patchQuestion(i, { correct: j })}
                      className="mt-3.5 size-5 shrink-0 cursor-pointer accent-indigo-600"
                    />
                    <Input
                      className="flex-1"
                      label={`Câu ${i + 1}, lựa chọn ${optionLetter(j)}`}
                      hideLabel
                      placeholder={`Lựa chọn ${optionLetter(j)}`}
                      value={o}
                      error={errors[`questions.${i}.options.${j}`]}
                      onChange={(e) => patchQuestion(i, { options: replaceAt(q.options, j, e.target.value) })}
                    />
                    <IconButton label={`Xóa lựa chọn ${optionLetter(j)} của câu ${i + 1}`} disabled={q.options.length <= LIMITS.options.min} onClick={() => removeOption(i, j)}>
                      <Trash2 />
                    </IconButton>
                  </div>
                ))}
              </div>
              {errors[correctKey] && (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                  {errors[correctKey]}
                </p>
              )}
              {errors[`questions.${i}.options`] && (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                  {errors[`questions.${i}.options`]}
                </p>
              )}

              <div className="mt-3">
                <Button type="button" variant="ghost" size="sm" leftIcon={<Plus />} disabled={q.options.length >= LIMITS.options.max} onClick={() => patchQuestion(i, { options: [...q.options, ""] })}>
                  Thêm lựa chọn
                </Button>
              </div>
            </fieldset>
          );
        })}
      </div>

      {errors.questions && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {errors.questions}
        </p>
      )}
      <Button type="button" variant="outline" leftIcon={<Plus />} disabled={state.questions.length >= LIMITS.questions.max} onClick={() => onChange({ ...state, questions: [...state.questions, newQuestion()] })}>
        Thêm câu hỏi ({state.questions.length}/{LIMITS.questions.max})
      </Button>
    </div>
  );
}
