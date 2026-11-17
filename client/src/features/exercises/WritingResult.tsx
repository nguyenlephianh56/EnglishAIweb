import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import { countWords } from "./answerUtils";
import AIFeedbackCard from "./shared/AIFeedbackCard";
import AnnotatedText from "./shared/AnnotatedText";
import ErrorList from "./shared/ErrorList";
import type { AttemptDetail } from "../../types/attempt";

interface WritingResultProps {
  attempt: AttemptDetail;
  gradingMessage?: string;
  regrading: boolean;
  onReload: () => void;
  onRegrade: () => void;
  regradeError?: string;
  reloading: boolean;
}

/** Kết quả bài Viết: chờ chấm, hoặc phản hồi AI + bài đã nộp có lỗi gạch đỏ + danh sách lỗi. */
export default function WritingResult({ attempt, gradingMessage, regrading, onReload, onRegrade, regradeError, reloading }: WritingResultProps) {
  const text = (attempt.submittedAnswer as { text?: unknown } | null)?.text;
  const essay = typeof text === "string" ? text : "";
  const pending = attempt.score === null || attempt.graded === false;
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {pending ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-amber-900">
            <Sparkles className="size-5" aria-hidden="true" />
            Đang chờ chấm
          </p>
          <p className="mt-1 text-sm text-amber-900">{gradingMessage ?? "Bài viết của em đã được lưu. Điểm sẽ hiện ngay khi AI chấm xong."}</p>
          {regradeError && (
            <div className="mt-3">
              <Notice type="error">{regradeError}</Notice>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" size="sm" leftIcon={<RefreshCw />} disabled={reloading || regrading} onClick={onReload}>
              Tải lại
            </Button>
            <Button size="sm" disabled={regrading} onClick={onRegrade}>
              {regrading ? "AI đang chấm bài…" : "Chấm lại bằng AI"}
            </Button>
          </div>
          {regrading && <p className="mt-3 text-sm font-semibold text-amber-900">AI đang chấm bài, có thể mất vài giây.</p>}
        </section>
      ) : (
        <AIFeedbackCard criteria={attempt.criteria} comment={attempt.comment} score={attempt.score} maxScore={attempt.maxScore} />
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="wr-essay">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="wr-essay" className="font-heading text-xl font-bold text-slate-900">
            Bài đã nộp
          </h2>
          <span className="text-sm text-slate-500">{countWords(essay)} từ</span>
        </div>
        <div className="mt-4">
          <AnnotatedText text={essay} errors={pending ? [] : attempt.errors} activeIndex={active} onActiveChange={setActive} idPrefix="result" />
        </div>

        {!pending && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Lỗi cần sửa ({attempt.errors.length})</h3>
            <ErrorList errors={attempt.errors} text={essay} activeIndex={active} onActiveChange={setActive} idPrefix="result" />
            {attempt.errors.length > 0 && attempt.errors.every((e) => e.correction === undefined && !e.explanation) && (
              <p className="mt-3 text-xs font-semibold text-sky-700">Gợi ý sửa và giải thích sẽ hiện sau hạn nộp.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
