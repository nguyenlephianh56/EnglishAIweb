import { ArrowLeft, CircleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import Button from "../../components/ui/Button";
import { getErrorMessage } from "../../api/client";

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}

/** Khung chờ khi đang tải đề hoặc kết quả */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8" role="status" aria-label="Đang tải">
      <div className="h-5 w-32 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-5 h-10 w-2/3 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-3 h-5 w-1/3 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

/** Hiện lỗi và đường quay về. Chỉ hiện nút Thử lại khi có thao tác tải lại. */
export function PageError({ error, onRetry, backTo, backLabel }: {
  error: unknown;
  onRetry?: () => void;
  backTo: string;
  backLabel: string;
}) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <BackLink to={backTo}>{backLabel}</BackLink>
      <div role="alert" className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-red-500" aria-hidden="true">
          <CircleAlert className="size-6" />
        </span>
        <p className="mt-3 font-heading text-lg font-bold text-red-700">Không mở được trang này</p>
        <p className="mt-1 text-sm font-semibold text-red-700">{getErrorMessage(error, "Đã có lỗi xảy ra, vui lòng thử lại.")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Thử lại
            </Button>
          )}
          <Button to={backTo}>{backLabel}</Button>
        </div>
      </div>
    </div>
  );
}