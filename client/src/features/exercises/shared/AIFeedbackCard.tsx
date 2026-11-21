import { Info, Sparkles } from "lucide-react";
import { CRITERIA, formatScore } from "./scoreFormat";
import type { CriteriaKey } from "../../../types/grading";

export interface AIFeedbackCardProps {
  /** Điểm theo tiêu chí (thang 10); khóa nào có trong `items` thì được vẽ */
  criteria?: object | null;
  /** Danh sách tiêu chí hiển thị (mặc định 4 tiêu chí bài Viết). Bài Nói truyền SPEAKING_CRITERIA. */
  items?: { key: string; label: string }[];
  comment?: string | null;
  score?: number | null;
  maxScore: number;
  className?: string;
}

/** Khối "Phản hồi từ AI": điểm tổng, 4 thanh tiêu chí (thang 10), nhận xét và huy hiệu cố định. Thiếu criteria thì ẩn phần thanh. */
export default function AIFeedbackCard({ criteria, items = CRITERIA as { key: CriteriaKey; label: string }[], comment, score, maxScore, className = "" }: AIFeedbackCardProps) {
  const scores = (criteria ?? {}) as Record<string, unknown>;
  const hasCriteria = Boolean(criteria) && items.every((c) => typeof scores[c.key] === "number");
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 ${className}`} aria-labelledby="ai-feedback-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="ai-feedback-title" className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900">
            <Sparkles className="size-5 text-brand" aria-hidden="true" />
            Phản hồi từ AI
          </h2>
          {typeof score === "number" && (
            <p className="mt-1 text-sm text-slate-500">
              Điểm AI chấm:{" "}
              <strong className="text-slate-900">
                {formatScore(score)}/{formatScore(maxScore)}
              </strong>
            </p>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
          <Info className="size-4" aria-hidden="true" />
          Điểm AI chỉ mang tính tham khảo
        </span>
      </div>

      {hasCriteria && criteria && (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2" aria-label="Điểm theo tiêu chí">
          {items.map((c) => {
            const v = scores[c.key] as number;
            return (
              <li key={c.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-800">{c.label}</span>
                  <span className="font-semibold text-slate-600">{formatScore(v)}/10</span>
                </div>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={c.label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={v}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, v * 10))}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {comment && (
        <div className="mt-5 rounded-2xl bg-slate-50 p-5">
          <p className="text-sm font-bold text-slate-900">Nhận xét</p>
          <p className="mt-1 whitespace-pre-line text-[15px] leading-7 text-slate-700">{comment}</p>
        </div>
      )}
    </section>
  );
}
