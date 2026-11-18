import Input from "../../../../components/ui/Input";
import Textarea from "../../../../components/ui/Textarea";
import { parseIntIn, resizeStrings } from "./helpers";
import { LIMITS } from "./types";
import type { EditorProps, ListeningFillState } from "./types";

/** Nghe điền từ: nội dung bài nghe, số chỗ trống (1–20) và đáp án từng chỗ trống theo thứ tự nghe. */
export default function ListeningFillEditor({ state, onChange, errors }: EditorProps<ListeningFillState>) {
  const n = parseIntIn(state.blanks, LIMITS.blanks.min, LIMITS.blanks.max);

  function setBlanks(raw: string) {
    const count = parseIntIn(raw, LIMITS.blanks.min, LIMITS.blanks.max);
    // Số hợp lệ thì ô đáp án tự khớp; đang gõ dở (rỗng, ngoài khoảng) thì giữ nguyên các đáp án đã nhập
    onChange({ ...state, blanks: raw, answers: count === undefined ? state.answers : resizeStrings(state.answers, count) });
  }

  return (
    <div className="space-y-6">
      <Textarea
        label="Nội dung bài nghe"
        placeholder="My name is Anna. I live in London with my parents."
        hint="Đoạn văn được đọc lên cho học sinh nghe."
        limit={LIMITS.longText}
        rows={6}
        value={state.script}
        error={errors.script}
        onChange={(e) => onChange({ ...state, script: e.target.value })}
      />
      <Input
        className="max-w-48"
        label="Số chỗ trống"
        type="number"
        inputMode="numeric"
        min={LIMITS.blanks.min}
        max={LIMITS.blanks.max}
        value={state.blanks}
        error={errors.blanks}
        onChange={(e) => setBlanks(e.target.value)}
      />

      {n !== undefined && (
        <div>
          <p className="text-sm font-bold text-slate-900">Đáp án theo thứ tự nghe</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {Array.from({ length: n }, (_, i) => (
              <Input
                key={i}
                label={`Đáp án chỗ trống ${i + 1}`}
                value={state.answers[i] ?? ""}
                error={errors[`answers.${i}`]}
                onChange={(e) => onChange({ ...state, answers: resizeStrings(state.answers, n).map((x, k) => (k === i ? e.target.value : x)) })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
