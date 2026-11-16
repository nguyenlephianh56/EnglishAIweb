import { useId } from "react";
import { countWords } from "../answerUtils";
import { BrokenContent, ExplanationBox } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Giới hạn ký tự của bài viết */
export const WRITING_MAX_CHARS = 30000;

/** Bài viết: hiện đề, ô soạn thảo, bộ đếm từ so với minWords và bộ đếm ký tự (tối đa 30.000). */
export default function WritingEditor({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"writing">) {
  const id = useId();
  const review = mode === "review";
  const locked = disabled || review;
  if (typeof content?.prompt !== "string") return <BrokenContent />;

  const text = typeof value?.text === "string" ? value.text : "";
  const minWords = typeof content.minWords === "number" && content.minWords > 0 ? content.minWords : 0;
  const words = countWords(text);
  const missing = Math.max(0, minWords - words);
  const enough = missing === 0;

  return (
    <div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Đề bài</p>
        <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{content.prompt}</p>
        {minWords > 0 && <p className="mt-2 text-sm font-semibold text-slate-500">Viết ít nhất {minWords} từ.</p>}
      </div>

      <div className="mt-5">
        <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-900">
          Bài viết của em
        </label>
        <textarea
          id={id}
          rows={12}
          value={text}
          maxLength={WRITING_MAX_CHARS}
          readOnly={review}
          disabled={disabled && !review}
          placeholder={review ? undefined : "Viết bài của em ở đây..."}
          aria-describedby={`${id}-count`}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full resize-y rounded-2xl border-2 border-slate-300 bg-white p-4 text-[15px] leading-7 text-slate-900 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20 read-only:bg-slate-50 disabled:bg-slate-50"
        />
        <div id={`${id}-count`} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={`font-bold ${enough ? "text-green-700" : "text-amber-700"}`}>
            {words}
            {minWords > 0 ? ` / ${minWords}` : ""} từ{!enough && !review ? ` • Cần thêm ${missing} từ` : enough && minWords > 0 ? " • Đủ số từ" : ""}
          </span>
          <span className={`text-xs ${text.length >= WRITING_MAX_CHARS ? "font-bold text-red-600" : "text-slate-400"}`}>
            {text.length.toLocaleString("vi-VN")}/{WRITING_MAX_CHARS.toLocaleString("vi-VN")} ký tự
          </span>
        </div>
        {/* Chỉ báo cho trình đọc màn hình khi trạng thái đủ/thiếu từ đổi, không đọc từng ký tự gõ */}
        <p className="sr-only" role="status" aria-live="polite">
          {minWords > 0 ? (enough ? "Đã đủ số từ tối thiểu." : "Chưa đủ số từ tối thiểu.") : ""}
        </p>
      </div>

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
