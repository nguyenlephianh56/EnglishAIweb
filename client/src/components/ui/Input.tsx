import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Thông báo lỗi hiện dưới ô, đồng thời đổi viền sang đỏ */
  error?: string;
  leftIcon?: ReactNode;
  id?: string;
  /** Ẩn nhãn khỏi giao diện nhưng vẫn giữ cho trình đọc màn hình (ô tìm kiếm...) */
  hideLabel?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, leftIcon, hideLabel, type = "text", id, className, ...rest },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";

  const inputClasses = [
    "h-12 w-full rounded-xl border bg-white text-sm text-slate-900 outline-none transition-colors duration-150 placeholder:text-slate-400 focus:ring-4 read-only:bg-slate-50 read-only:text-slate-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
    leftIcon ? "pl-11" : "pl-4",
    isPassword ? "pr-12" : "pr-4",
    error ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-brand focus:ring-brand/20",
  ].join(" ");

  return (
    <div className={className}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : "mb-1.5 block text-sm font-bold text-slate-900"}>
        {label}
      </label>
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400 [&>svg]:size-5" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={isPassword && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={inputClasses}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={visible}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
});

export default Input;
