import { useId } from "react";
import { ChevronDown } from "lucide-react";

interface SelectFieldProps<V extends string> {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Gợi ý dưới ô, ví dụ lý do ô bị khóa */
  hint?: string;
  className?: string;
}

/** Ô chọn một giá trị, cùng kiểu với Input */
export default function SelectField<V extends string>({ label, value, options, onChange, disabled, hint, className }: SelectFieldProps<V>) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-900">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value as V)}
          className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm text-slate-900 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
