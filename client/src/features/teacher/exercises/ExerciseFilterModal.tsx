import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { LEVEL_OPTIONS, SKILL_OPTIONS } from "../../student/libraryFilters";
import { TYPE_FILTER_OPTIONS } from "./exerciseMeta";
import type { ExerciseFilters } from "./exerciseMeta";

type Draft = Pick<ExerciseFilters, "skill" | "level" | "type">;

function RadioChips<T extends string>({ legend, name, value, options, onChange }: { legend: string; name: string; value: T | undefined; options: { value: T; label: ReactNode }[]; onChange: (v: T | undefined) => void }) {
  const all: { value: T | undefined; label: ReactNode }[] = [{ value: undefined, label: "Tất cả" }, ...options];
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-slate-900">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {all.map((o) => {
          const selected = value === o.value;
          return (
            <label key={o.value ?? "all"} className="cursor-pointer">
              <input type="radio" name={name} checked={selected} onChange={() => onChange(o.value)} className="peer sr-only" />
              <span className={`block rounded-full px-4 py-2 text-xs font-bold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 ${selected ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

interface ExerciseFilterModalProps {
  open: boolean;
  onClose: () => void;
  value: Draft;
  onApply: (next: Draft) => void;
}

/** Bộ lọc kỹ năng / cấp độ / dạng bài. Các giá trị này được gửi thẳng lên GET /exercises. */
export default function ExerciseFilterModal({ open, onClose, value, onApply }: ExerciseFilterModalProps) {
  const [draft, setDraft] = useState<Draft>(value);
  useEffect(() => {
    if (open) setDraft(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Bộ lọc" description="Lọc bài tập theo kỹ năng, cấp độ và dạng bài.">
      <div className="space-y-5">
        <RadioChips legend="Kỹ năng" name="f-skill" value={draft.skill} options={SKILL_OPTIONS} onChange={(skill) => setDraft((d) => ({ ...d, skill }))} />
        <RadioChips legend="Cấp độ" name="f-level" value={draft.level} options={LEVEL_OPTIONS.map((l) => ({ value: l, label: l }))} onChange={(level) => setDraft((d) => ({ ...d, level }))} />
        <RadioChips legend="Dạng bài" name="f-type" value={draft.type} options={TYPE_FILTER_OPTIONS} onChange={(type) => setDraft((d) => ({ ...d, type }))} />
      </div>
      <div className="mt-8 flex justify-end gap-3">
        <Button variant="outline" disabled={!draft.skill && !draft.level && !draft.type} onClick={() => setDraft({})}>
          Xóa lọc
        </Button>
        <Button onClick={() => onApply(draft)}>Áp dụng</Button>
      </div>
    </Modal>
  );
}
