import { useId } from "react";
import { countWords } from "../answerUtils";
import { BrokenContent, ExplanationBox } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Giới hạn ký tự của bài viết */
export const WRITING_MAX_CHARS = 30000;
/** Cảnh báo khi đã dùng quá 90% giới hạn */
const WARN_AT = Math.floor(WRITING_MAX_CHARS * 0.9);

/**
 * Bài viết: desktop 2 cột (trái đề bài cố định khi cuộn, phải ô soạn thảo), mobile xếp dọc.
 * Đếm từ đúng như backend, thanh tiến độ so với minWords (xanh lá khi đạt), tối đa 30.000 ký tự.
 */
export default function WritingEditor({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"writing">) {
  const id = useId();
  const review = mode === "review";
  if (typeof content?.prompt !== "string") return <BrokenContent />;

  const text = typeof value?.text === "string" ? value.text : "";
  const minWords = typeof content.minWords === "number" && content.minWords > 0 ? content.minWords : 0;
  const words = countWords(text);
  const missing = Math.max(0, minWords - words);
  const enough = missing === 0;
  const percent = minWords > 0 ? Math.min(100, Math.round((words / minWords) * 100)) : words > 0 ? 100 : 0;
  const atLimit = text.length >= WRITING_MAX_CHARS;
  const nearLimit = text.length > WARN_AT;

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <aside className="lg:sticky lg:top-24 lg:col-span-2 lg:self-start" aria-label="Đề bài">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài</p>
          <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{content.prompt}</p>
          {minWords > 0 && <p className="mt-3 text-sm font-semibold text-slate-500">Viết ít nhất {minWords} từ.</p>}
        </div>
      </aside>

      <div className="lg:col-span-3">
        <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-900">
          Bài viết của em
        </label>
        <textarea
          id={id}
          rows={16}
          value={text}
          maxLength={WRITING_MAX_CHARS}
          readOnly={review}
          disabled={disabled && !review}
          placeholder={review ? undefined : "Viết bài của em ở đây..."}
          aria-describedby={`${id}-count`}
          onChange={(e) => onChange({ text: e.target.value })}
          className="min-h-72 w-full resize-y rounded-2xl border-2 border-slate-300 bg-white p-4 text-base sm:text-[15px] leading-7 text-slate-900 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20 read-only:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-500"
        />

        <div id={`${id}-count`} className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className={`font-bold ${enough ? "text-green-700" : "text-amber-700"}`}>
              {words}
              {minWords > 0 ? ` / ${minWords}` : ""} từ{!enough && !review ? ` • Cần thêm ${missing} từ` : ""}
            </span>
            <span className={`text-xs ${atLimit ? "font-bold text-red-600" : nearLimit ? "font-bold text-amber-700" : "text-slate-400"}`}>
              {text.length.toLocaleString("vi-VN")}/{WRITING_MAX_CHARS.toLocaleString("vi-VN")} ký tự
            </span>
          </div>
          {minWords > 0 && (
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="Số từ so với tối thiểu" aria-valuemin={0} aria-valuemax={minWords} aria-valuenow={Math.min(words, minWords)}>
              <div className={`h-full rounded-full transition-[width] duration-300 ${enough ? "bg-green-500" : "bg-brand"}`} style={{ width: `${percent}%` }} />
            </div>
          )}
          {!review && nearLimit && (
            <p className={`mt-2 text-xs font-semibold ${atLimit ? "text-red-600" : "text-amber-700"}`} role="status" aria-live="polite">
              {atLimit ? "Đã đạt giới hạn ký tự, không gõ thêm được." : "Bài viết sắp chạm giới hạn 30.000 ký tự."}
            </p>
          )}
        </div>
        {/* Chỉ báo cho trình đọc màn hình khi trạng thái đủ/thiếu từ đổi, không đọc từng ký tự gõ */}
        <p className="sr-only" role="status" aria-live="polite">
          {minWords > 0 ? (enough ? "Đã đủ số từ tối thiểu." : "Chưa đủ số từ tối thiểu.") : ""}
        </p>

        {review && <ExplanationBox text={result?.explanation} />}
      </div>
    </div>
  );
}
