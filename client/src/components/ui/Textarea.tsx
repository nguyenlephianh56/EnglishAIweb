import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  /** Thông báo lỗi hiện dưới ô, đồng thời đổi viền sang đỏ */
  error?: string;
  /** Gợi ý ngắn dưới ô (ẩn khi đang có lỗi) */
  hint?: string;
  /** Giới hạn ký tự: hiện bộ đếm "n/limit" (đỏ khi vượt), không chặn gõ. Đếm sau khi bỏ khoảng trắng đầu/cuối. */
  limit?: number;
  id?: string;
  /** Ẩn nhãn khỏi giao diện nhưng vẫn giữ cho trình đọc màn hình */
  hideLabel?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, limit, hideLabel, id, className, rows = 4, ...rest },
  ref
) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const length = typeof rest.value === "string" ? rest.value.trim().length : 0;
  const over = limit !== undefined && length > limit;
  const describedBy = [error ? errorId : hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  const classes = [
    "min-h-28 w-full resize-y rounded-xl border bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition-colors duration-150 placeholder:text-slate-400 focus:ring-4 read-only:bg-slate-50 read-only:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
    error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-brand focus:ring-brand/20",
  ].join(" ");

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className={hideLabel ? "sr-only" : "block text-sm font-bold text-slate-900"}>
          {label}
        </label>
        {limit !== undefined && (
          <span className={`text-xs ${over ? "font-bold text-red-600" : "text-slate-400"}`} aria-hidden="true">
            {length.toLocaleString("vi-VN")}/{limit.toLocaleString("vi-VN")}
          </span>
        )}
      </div>
      <textarea ref={ref} id={fieldId} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={classes} {...rest} />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="mt-1.5 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

export default Textarea;
