import { useMemo, useState } from "react";
import { Info, RefreshCw, Sparkles } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import { CRITERIA, errorGroupLabel, formatScore } from "../teacher/grading/gradingMeta";
import { countWords } from "./answerUtils";
import { locateErrors, splitByErrors } from "./textMarks";
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

/** Kết quả bài Viết: bài đã nộp với lỗi gạch đỏ, phản hồi AI (4 tiêu chí + nhận xét), hoặc trạng thái chờ chấm. */
export default function WritingResult({ attempt, gradingMessage, regrading, onReload, onRegrade, regradeError, reloading }: WritingResultProps) {
  const text = (attempt.submittedAnswer as { text?: unknown } | null)?.text;
  const essay = typeof text === "string" ? text : "";
  const pending = attempt.score === null && attempt.finalScore === null;
  const [active, setActive] = useState<number | null>(null);

  const located = useMemo(() => locateErrors(essay, attempt.errors), [essay, attempt.errors]);
  const segments = useMemo(() => splitByErrors(essay, located.ranges), [essay, located.ranges]);
  const unmatched = new Set(located.unmatched);
  const hasCorrections = attempt.errors.some((e) => e.correction !== undefined);

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
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="wr-ai">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="wr-ai" className="flex items-center gap-2 font-heading text-xl font-bold text-slate-900">
              <Sparkles className="size-5 text-brand" aria-hidden="true" />
              Phản hồi từ AI
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              <Info className="size-4" aria-hidden="true" />
              Điểm AI chỉ mang tính tham khảo
            </span>
          </div>

          {attempt.criteria && (
            <ul className="mt-5 grid gap-4 sm:grid-cols-2" aria-label="Điểm theo tiêu chí">
              {CRITERIA.map((c) => {
                const v = attempt.criteria![c.key];
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

          {attempt.comment && (
            <div className="mt-5 rounded-2xl bg-slate-50 p-5">
              <p className="text-sm font-bold text-slate-900">Nhận xét</p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-7 text-slate-700">{attempt.comment}</p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="wr-essay">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="wr-essay" className="font-heading text-xl font-bold text-slate-900">
            Bài đã nộp
          </h2>
          <span className="text-sm text-slate-500">{countWords(essay)} từ</span>
        </div>

        <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-[15px] leading-8 text-slate-800">
          {segments.map((s, i) =>
            s.errorIndex === undefined ? (
              <span key={i}>{s.text}</span>
            ) : (
              <button
                key={i}
                type="button"
                aria-pressed={active === s.errorIndex}
                aria-label={`Lỗi ${s.errorIndex + 1}: ${s.text}`}
                title={`${errorGroupLabel(attempt.errors[s.errorIndex].type)}${attempt.errors[s.errorIndex].correction ? `: ${s.text} → ${attempt.errors[s.errorIndex].correction}` : ""}`}
                onClick={() => setActive((cur) => (cur === s.errorIndex ? null : s.errorIndex))}
                onMouseEnter={() => setActive(s.errorIndex)}
                className={`rounded-sm bg-red-50 px-0.5 text-left underline decoration-red-500 decoration-wavy decoration-2 underline-offset-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 ${active === s.errorIndex ? "bg-red-100" : ""}`}
              >
                {s.text}
                <sup className="ml-0.5 font-bold text-red-600">{s.errorIndex + 1}</sup>
              </button>
            )
          )}
          {essay === "" && <span className="text-slate-400">Không đọc được nội dung bài đã nộp.</span>}
        </div>

        {!pending && attempt.errors.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-bold text-slate-900">Lỗi cần sửa ({attempt.errors.length})</h3>
            {!hasCorrections && <p className="mt-1 text-xs font-semibold text-sky-700">Gợi ý sửa và giải thích sẽ hiện sau hạn nộp.</p>}
            <ol className="mt-3 space-y-3">
              {attempt.errors.map((e, i) => (
                <li
                  key={i}
                  className={`flex gap-3 rounded-2xl border p-4 transition-colors ${active === i ? "border-red-300 bg-red-50/60" : "border-slate-100"}`}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-600">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">
                      <span className="text-red-600 line-through decoration-red-300">{e.text}</span>
                      {e.correction !== undefined && e.correction !== "" && (
                        <>
                          <span className="mx-2 text-slate-400" aria-label="sửa thành">
                            →
                          </span>
                          <span className="text-green-700">{e.correction}</span>
                        </>
                      )}
                    </p>
                    {e.explanation && <p className="mt-1 text-sm text-slate-600">{e.explanation}</p>}
                    <p className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">{errorGroupLabel(e.type)}</span>
                      {unmatched.has(i) && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">Không xác định được vị trí trong bài</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    </div>
  );
}
