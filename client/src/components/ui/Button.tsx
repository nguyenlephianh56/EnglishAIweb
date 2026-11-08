import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Hiện spinner + "Đang xử lý" và chặn bấm */
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  /** Nếu có, nút hiển thị như liên kết điều hướng (React Router) với cùng giao diện */
  to?: string;
}

const base =
  "inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap select-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white shadow-lg shadow-brand/25 hover:bg-brand-dark focus-visible:ring-brand/30",
  secondary: "bg-secondary text-white shadow-lg shadow-secondary/25 hover:bg-teal-600 focus-visible:ring-secondary/30",
  outline: "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 focus-visible:ring-brand/25",
  ghost: "bg-transparent text-brand hover:bg-brand-light focus-visible:ring-brand/25",
  danger: "bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-600 focus-visible:ring-red-500/30",
};

// Trạng thái vô hiệu / đang tải: xám, không bóng, không hover
const inertVariants: Record<ButtonVariant, string> = {
  primary: "cursor-not-allowed bg-slate-200 text-slate-400",
  secondary: "cursor-not-allowed bg-slate-200 text-slate-400",
  danger: "cursor-not-allowed bg-slate-200 text-slate-400",
  outline: "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400",
  ghost: "cursor-not-allowed bg-transparent text-slate-400",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-xs rounded-xl",
  md: "h-12 px-6 text-sm rounded-xl",
  lg: "h-14 px-8 text-base rounded-2xl",
};

const iconWrap = "inline-flex shrink-0 [&>svg]:size-[1.25em]";

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    to,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref
) {
  const inert = Boolean(disabled) || loading;
  const classes = [base, sizes[size], inert ? inertVariants[variant] : variants[variant], fullWidth && "w-full", className]
    .filter(Boolean)
    .join(" ");

  const content = loading ? (
    <>
      <Loader2 className="size-[1.25em] animate-spin" aria-hidden="true" />
      Đang xử lý
    </>
  ) : (
    <>
      {leftIcon && <span className={iconWrap}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={iconWrap}>{rightIcon}</span>}
    </>
  );

  if (to && !inert) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type} disabled={inert} aria-busy={loading || undefined} className={classes} {...rest}>
      {content}
    </button>
  );
});

export default Button;
