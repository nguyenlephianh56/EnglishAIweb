import { Sparkles } from "lucide-react";
import Notice from "../../account/Notice";
import AIFeedbackCard from "../../exercises/shared/AIFeedbackCard";
import { SPEAKING_CRITERIA, formatScore } from "../../exercises/shared/scoreFormat";
import { autoVerdict, isAiGradedType } from "./gradingMeta";
import type { AttemptReview } from "../../../types/attemptReview";

/**
 * Khối "Gợi ý của AI": bài Viết/Nói hiện điểm AI, tiêu chí và nhận xét có sẵn (không gọi AI thêm);
 * dạng chấm tự động chỉ có điểm và số câu đúng.
 */
export default function AiSuggestion({ review }: { review: AttemptReview }) {
  const { type } = review.exercise;
  const pending = review.grading_status === "PENDING" && review.score === null;

  if (pending) {
    return (
      <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="ai-pending-title">
        <h2 id="ai-pending-title" className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
          <Sparkles className="size-5 text-brand" aria-hidden="true" />
          Gợi ý của AI
        </h2>
        <Notice type="warning">AI đang chấm hoặc chưa có điểm AI</Notice>
        <p className="text-sm text-slate-500">Thầy/cô vẫn có thể nhập điểm và nhận xét ở bên dưới.</p>
      </section>
    );
  }

  if (isAiGradedType(type)) {
    if (review.score === null) {
      return (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-amber-900">
            <Sparkles className="size-5" aria-hidden="true" />
            Gợi ý của AI
          </p>
          <p className="mt-1 text-sm text-amber-900">AI chưa chấm bài này nên chưa có điểm gợi ý. Thầy/cô vẫn có thể chấm điểm ở bên dưới.</p>
        </section>
      );
    }
    return (
      <AIFeedbackCard
        title="Gợi ý của AI"
        criteria={review.ai_feedback?.criteria}
        items={type === "speaking" ? SPEAKING_CRITERIA : undefined}
        comment={review.ai_feedback?.comment}
        score={review.score}
        maxScore={review.max_score}
      />
    );
  }

  const verdict = autoVerdict(review);
  const correct = verdict.filter(Boolean).length;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="ai-auto-title">
      <h2 id="ai-auto-title" className="font-heading text-lg font-bold text-slate-900">
        Chấm tự động
      </h2>
      <p className="mt-1 text-sm text-slate-500">Dạng bài này được hệ thống chấm theo đáp án, không dùng AI.</p>
      <p className="mt-4 font-heading text-3xl font-extrabold text-brand">
        {review.score === null ? "—" : formatScore(review.score)}
        <span className="text-lg font-bold text-slate-400">/{formatScore(review.max_score)}</span>
      </p>
      {verdict.length > 0 && (
        <p className="mt-2 text-sm font-semibold text-slate-700">
          Đúng {correct}/{verdict.length}
        </p>
      )}
    </section>
  );
}
