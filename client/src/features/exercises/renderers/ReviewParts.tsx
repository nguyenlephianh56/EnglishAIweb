import { Check, CircleAlert, Lightbulb, X } from "lucide-react";
import type { ReactNode } from "react";

/** Huy hiệu nhỏ "Đáp án đúng" (xanh) hoặc "Chưa chính xác" (đỏ) ở chế độ xem lại */
export function ReviewBadge({ correct, children }: { correct: boolean; children?: ReactNode }) {
  const Icon = correct ? Check : X;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
      <Icon className="size-3.5" aria-hidden="true" />
      {children ?? (correct ? "Đáp án đúng" : "Chưa chính xác")}
    </span>
  );
}

/** Khung giải thích ở cuối bài khi xem lại */
export function ExplanationBox({ text }: { text?: string | null }) {
  if (!text || !text.trim()) return null;
  return (
    <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
      <div>
        <p className="font-bold">Giải thích</p>
        <p className="mt-1 whitespace-pre-line">{text}</p>
      </div>
    </div>
  );
}

/** Dòng cảnh báo khi dữ liệu bài bị thiếu hoặc sai dạng */
export function BrokenContent({ message = "Nội dung bài tập không hợp lệ." }: { message?: string }) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      {message}
    </div>
  );
}

/** Chữ cái đánh số lựa chọn: 0 -> A */
export const optionLetter = (i: number) => String.fromCharCode(65 + (i % 26));
