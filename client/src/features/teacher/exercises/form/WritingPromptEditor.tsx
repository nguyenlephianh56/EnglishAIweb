import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import { LIMITS } from "./types";
import type { EditorProps, WritingState } from "./types";

/** Viết: đề bài và số từ tối thiểu. Bài do AI chấm nên không có đáp án. */
export default function WritingPromptEditor({ state, onChange, errors }: EditorProps<WritingState>) {
  return (
    <div className="space-y-6">
      <Textarea
        label="Đề bài"
        placeholder="Write about your favourite hobby. Say what it is and why you like it."
        limit={LIMITS.prompt}
        rows={5}
        value={state.prompt}
        error={errors.prompt}
        onChange={(e) => onChange({ ...state, prompt: e.target.value })}
      />
      <Input
        className="max-w-56"
        label="Số từ tối thiểu"
        type="number"
        inputMode="numeric"
        min={LIMITS.minWords.min}
        max={LIMITS.minWords.max}
        value={state.minWords}
        error={errors.minWords}
        onChange={(e) => onChange({ ...state, minWords: e.target.value })}
      />
      <p className="-mt-3 text-xs text-slate-500">Bài Viết do AI chấm điểm nên không cần nhập đáp án.</p>
    </div>
  );
}
