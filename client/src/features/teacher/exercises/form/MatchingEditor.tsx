import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Input from "../../../../components/ui/Input";
import IconButton from "./IconButton";
import { removeAt, replaceAt } from "./helpers";
import { LIMITS } from "./types";
import type { EditorProps, MatchingState } from "./types";

/** Nối cặp: mỗi dòng là một cặp (vế trái – vế phải), 2–15 cặp. Dòng i nối vế trái i với vế phải i. */
export default function MatchingEditor({ state, onChange, errors }: EditorProps<MatchingState>) {
  const patch = (i: number, p: Partial<MatchingState["pairs"][number]>) => onChange({ pairs: replaceAt(state.pairs, i, { ...state.pairs[i], ...p }) });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">Mỗi dòng là một cặp đúng. Học sinh sẽ thấy hai cột và phải nối từng vế trái với vế phải tương ứng.</p>
      <ol className="space-y-3">
        {state.pairs.map((p, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-3 grid size-6 shrink-0 place-items-center rounded-full bg-brand-light text-xs font-bold text-brand" aria-hidden="true">
              {i + 1}
            </span>
            <Input className="flex-1" label={`Cặp ${i + 1}, vế trái`} hideLabel placeholder="Vế trái" value={p.left} error={errors[`pairs.${i}.left`]} onChange={(e) => patch(i, { left: e.target.value })} />
            <ArrowLeftRight className="mt-3.5 size-5 shrink-0 text-slate-300" aria-hidden="true" />
            <Input className="flex-1" label={`Cặp ${i + 1}, vế phải`} hideLabel placeholder="Vế phải" value={p.right} error={errors[`pairs.${i}.right`]} onChange={(e) => patch(i, { right: e.target.value })} />
            <IconButton label={`Xóa cặp ${i + 1}`} disabled={state.pairs.length <= LIMITS.pairs.min} onClick={() => onChange({ pairs: removeAt(state.pairs, i) })}>
              <Trash2 />
            </IconButton>
          </li>
        ))}
      </ol>
      {errors.pairs && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {errors.pairs}
        </p>
      )}
      <Button type="button" variant="outline" leftIcon={<Plus />} disabled={state.pairs.length >= LIMITS.pairs.max} onClick={() => onChange({ pairs: [...state.pairs, { left: "", right: "" }] })}>
        Thêm cặp ({state.pairs.length}/{LIMITS.pairs.max})
      </Button>
    </div>
  );
}
