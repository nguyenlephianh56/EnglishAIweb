import { useMemo, useState } from "react";
import { Mic, RefreshCw, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import AIFeedbackCard from "./shared/AIFeedbackCard";
import AnnotatedText from "./shared/AnnotatedText";
import { SPEAKING_CRITERIA } from "./shared/scoreFormat";
import type { AttemptDetail } from "../../types/attempt";

interface SpeakingResultProps {
  attempt: AttemptDetail;
  gradingMessage?: string;
  onReload: () => void;
  reloading: boolean;
  /** Đường dẫn để ghi âm lại; null khi hết lượt */
  retakeTo: string | null;
}

/**
 * Kết quả bài Nói: chờ chấm (kèm "Ghi âm lại", không có "chấm lại" vì backend chỉ chấm lại bài Viết),
 * hoặc phản hồi AI (3 tiêu chí + nhận xét), bản chữ lời nói với các từ phát âm chưa tốt được tô, và danh sách "Từ cần luyện".
 */
export default function SpeakingResult({ attempt, gradingMessage, onReload, reloading, retakeTo }: SpeakingResultProps) {
  const text = (attempt.submittedAnswer as { text?: unknown } | null)?.text;
  const transcript = typeof text === "string" ? text : "";
  const pending = attempt.score === null || attempt.graded === false;
  const [active, setActive] = useState<number | null>(null);

  // Chỉ lỗi phát âm; bỏ `correction` vì nó chỉ lặp lại chính từ đó
  const words = useMemo(
    () => (pending ? [] : attempt.errors.filter((e) => e.type === "pronunciation" && e.text.trim() !== "").map((e) => ({ type: e.type, text: e.text, explanation: e.explanation }))),
    [attempt.errors, pending],
  );
  const noExplanations = words.length > 0 && words.every((w) => !w.explanation);

  return (
    <div className="space-y-6">
      {pending ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6" aria-live="polite">
          <p className="flex items-center gap-2 font-heading text-lg font-bold text-amber-900">
            <Sparkles className="size-5" aria-hidden="true" />
            Đang chờ chấm
          </p>
          <p className="mt-1 text-sm text-amber-900">{gradingMessage ?? "Bài nói của em đã được lưu. Điểm sẽ hiện ngay khi AI chấm xong."}</p>
          <p className="mt-1 text-sm text-amber-900">Bản ghi âm không được giữ lại, nên bài này không chấm lại được. Hãy ghi âm lại để có điểm.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button variant="outline" size="sm" leftIcon={<RefreshCw />} disabled={reloading} onClick={onReload}>
              Tải lại
            </Button>
            {retakeTo && (
              <Button to={retakeTo} size="sm" leftIcon={<Mic />}>
                Ghi âm lại
              </Button>
            )}
          </div>
        </section>
      ) : (
        <AIFeedbackCard criteria={attempt.criteria} items={SPEAKING_CRITERIA} comment={attempt.comment} score={attempt.score} maxScore={attempt.maxScore} />
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="sp-transcript">
        <h2 id="sp-transcript" className="font-heading text-xl font-bold text-slate-900">
          Lời em đã nói
        </h2>
        <p className="mt-1 text-sm text-slate-500">Bản chữ do AI nghe và ghi lại{!pending && words.length > 0 ? ". Những từ gạch đỏ là từ cần luyện phát âm." : "."}</p>
        <div className="mt-4">
          {transcript === "" ? (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">Không có bản chữ.</p>
          ) : (
            <AnnotatedText text={transcript} errors={words} activeIndex={active} onActiveChange={setActive} idPrefix="speak" />
          )}
        </div>
      </section>

      {!pending && (
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="sp-words">
          <h2 id="sp-words" className="font-heading text-xl font-bold text-slate-900">
            Từ cần luyện{words.length > 0 ? ` (${words.length})` : ""}
          </h2>
          {words.length === 0 ? (
            <p className="mt-3 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-800">Tuyệt vời! AI không thấy từ nào em phát âm sai.</p>
          ) : (
            <>
              <ul className="mt-4 space-y-3">
                {words.map((w, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      aria-pressed={active === i}
                      onClick={() => setActive(active === i ? null : i)}
                      className={`flex w-full flex-col gap-1 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 ${active === i ? "border-red-300 bg-red-50/60" : "border-slate-100 hover:bg-slate-50"}`}
                    >
                      <span className="text-sm font-bold text-red-600">{w.text}</span>
                      {w.explanation && <span className="text-sm text-slate-600">{w.explanation}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              {noExplanations && <p className="mt-3 text-xs font-semibold text-sky-700">Giải thích chi tiết sẽ hiện sau hạn nộp.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
