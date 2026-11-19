import { Lightbulb } from "lucide-react";
import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import { countBlanks } from "../../../exercises/answerUtils";
import { resizeStrings } from "./helpers";
import { LIMITS } from "./types";
import type { EditorProps, FillBlankState } from "./types";

/** Điền từ: gõ văn bản có chỗ trống "___"; ô đáp án tự khớp theo số chỗ trống (tối đa 20). */
export default function FillBlankEditor({ state, onChange, errors }: EditorProps<FillBlankState>) {
  const blanks = countBlanks(state.text.trim());

  function setText(text: string) {
    const n = Math.min(countBlanks(text.trim()), LIMITS.blanks.max);
    onChange({ ...state, text, answers: resizeStrings(state.answers, n) });
  }

  return (
    <div className="space-y-6">
      <Textarea
        label="Văn bản có chỗ trống"
        placeholder="Yesterday I ___ to the market and ___ some fruit."
        hint="Mỗi chỗ trống là một cụm từ 3 dấu gạch dưới trở lên (___)."
        limit={LIMITS.longText}
        rows={5}
        value={state.text}
        error={errors.text}
        onChange={(e) => setText(e.target.value)}
      />
      <Textarea
        label="Gợi ý (không bắt buộc)"
        limit={LIMITS.prompt}
        rows={2}
        className="[&_textarea]:min-h-16"
        value={state.hint}
        error={errors.hint}
        onChange={(e) => onChange({ ...state, hint: e.target.value })}
      />

      <div>
        <p className="text-sm font-bold text-slate-900">
          Đáp án <span className="font-semibold text-slate-500">({blanks} chỗ trống)</span>
        </p>
        {state.answers.length === 0 ? (
          <p className="mt-2 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
            <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Gõ ___ vào văn bản để tạo chỗ trống, ô đáp án sẽ xuất hiện ở đây.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {state.answers.map((a, i) => (
              <Input
                key={i}
                label={`Đáp án chỗ trống ${i + 1}`}
                value={a}
                error={errors[`answers.${i}`]}
                onChange={(e) => onChange({ ...state, answers: state.answers.map((x, k) => (k === i ? e.target.value : x)) })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
