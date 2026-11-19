import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import { LIMITS } from "./types";
import type { EditorProps, ErrorCorrectionState } from "./types";

/** Sửa lỗi: câu có lỗi, phần sai (nguyên văn trong câu) và bản sửa đúng. */
export default function ErrorCorrectionEditor({ state, onChange, errors }: EditorProps<ErrorCorrectionState>) {
  return (
    <div className="space-y-6">
      <Textarea
        label="Câu có lỗi"
        placeholder="She don't like playing football on Sundays."
        limit={LIMITS.sentence}
        rows={3}
        value={state.sentence}
        error={errors.sentence}
        onChange={(e) => onChange({ ...state, sentence: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Phần sai"
          placeholder="don't like"
          value={state.wrong}
          error={errors.wrong}
          onChange={(e) => onChange({ ...state, wrong: e.target.value })}
        />
        <Input
          label="Bản sửa đúng"
          placeholder="doesn't like"
          value={state.correction}
          error={errors.correction}
          onChange={(e) => onChange({ ...state, correction: e.target.value })}
        />
      </div>
      <p className="-mt-3 text-xs text-slate-500">Phần sai phải chép đúng nguyên văn từ câu trên (phân biệt chữ hoa/thường).</p>
    </div>
  );
}
