import { Timer } from "lucide-react";
import { formatClock } from "./examConfig";

/** Câu đọc cho trình đọc màn hình, chỉ đổi khi chạm mốc 5 phút, 1 phút, 10 giây (không đọc từng giây) */
function announcement(remainingSec: number, durationSec: number): string {
  if (remainingSec <= 0) return "Đã hết giờ.";
  if (remainingSec <= 10) return "Còn 10 giây.";
  if (remainingSec <= 60) return "Còn 1 phút.";
  if (remainingSec <= 300 && durationSec > 300) return "Còn 5 phút.";
  return "";
}

/** Thanh thời gian dính phía trên khi thi thử: đồng hồ đếm ngược và thanh tiến độ thời gian đã trôi */
export default function ExamBar({ remainingMs, durationSec }: { remainingMs: number; durationSec: number }) {
  const totalMs = durationSec * 1000;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const elapsedPercent = Math.min(100, Math.max(0, Math.round((1 - remainingMs / totalMs) * 100)));
  const tone = remainingMs <= 60 * 1000 ? "red" : remainingMs <= totalMs * 0.2 ? "amber" : "normal";
  const text = { normal: "text-slate-900", amber: "text-amber-600", red: "text-red-600" }[tone];
  const bar = { normal: "bg-brand", amber: "bg-amber-500", red: "bg-red-500" }[tone];

  return (
    <div className="sticky top-20 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto max-w-4xl px-5 py-3 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-500">
            <Timer className="size-4" aria-hidden="true" />
            Thi thử · còn lại
          </span>
          <span role="timer" aria-live="off" aria-label="Thời gian còn lại" className={`font-mono text-2xl font-extrabold tabular-nums ${text}`}>
            {formatClock(remainingSec)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Thời gian đã trôi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={elapsedPercent}>
          <div className={`h-full rounded-full transition-[width] duration-300 ${bar}`} style={{ width: `${elapsedPercent}%` }} />
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement(remainingSec, durationSec)}
        </p>
      </div>
    </div>
  );
}
