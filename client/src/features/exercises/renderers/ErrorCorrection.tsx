import { useId } from "react";
import { Check } from "lucide-react";
import { compareAnswer } from "../answerUtils";
import { BrokenContent, ExplanationBox, ReviewBadge } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Sửa lỗi: câu gốc với phần `wrong` được tô đỏ sẵn, một ô nhập bản sửa cho phần đó. */
export default function ErrorCorrection({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"error_correction">) {
  const id = useId();
  const review = mode === "review";
  const locked = disabled || review;
  if (typeof content?.sentence !== "string" || typeof content?.wrong !== "string") return <BrokenContent />;

  const answer = value?.[0] ?? "";
  const correct = result?.correctAnswer;
  const ok = review && correct ? compareAnswer("error_correction", [answer], correct)[0] : undefined;

  // Backend đảm bảo `wrong` nằm nguyên văn trong câu; nếu không thấy thì hiện câu thường kèm phần sai riêng
  const at = content.sentence.indexOf(content.wrong);
  const before = at >= 0 ? content.sentence.slice(0, at) : content.sentence;
  const after = at >= 0 ? content.sentence.slice(at + content.wrong.length) : "";

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-slate-500">Câu có một lỗi sai (phần tô đỏ). Hãy sửa lại cho đúng.</p>
      <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-[17px] leading-8 text-slate-800">
        {before}
        {at >= 0 ? (
          <mark className="rounded bg-red-100 px-1 font-bold text-red-700 underline decoration-red-400 decoration-wavy underline-offset-4">
            <span className="sr-only">(phần sai) </span>
            {content.wrong}
          </mark>
        ) : null}
        {after}
      </p>
      {at < 0 && (
        <p className="mt-2 text-sm text-slate-600">
          Phần sai: <strong className="text-red-700">{content.wrong}</strong>
        </p>
      )}

      <div className="mt-5">
        <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-slate-900">
          Bản sửa cho phần được tô đỏ
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <input
            id={id}
            type="text"
            value={answer}
            disabled={locked}
            autoComplete="off"
            spellCheck={false}
            placeholder="Nhập bản sửa..."
            aria-invalid={ok === false ? true : undefined}
            onChange={(e) => onChange([e.target.value])}
            className={`h-12 w-full max-w-md rounded-xl border-2 px-4 text-base sm:text-[15px] outline-none transition-colors focus:ring-4 disabled:cursor-default ${
              ok === undefined
                ? "border-slate-300 bg-white text-slate-900 focus:border-brand focus:ring-brand/20 disabled:bg-slate-50"
                : ok
                  ? "border-green-500 bg-green-50 text-green-800"
                  : "border-red-500 bg-red-50 text-red-700"
            }`}
          />
          {ok === true && (
            <span className="inline-flex items-center gap-1 text-sm font-bold text-green-700">
              <Check className="size-5" aria-hidden="true" />
              Chính xác
            </span>
          )}
          {ok === false && <ReviewBadge correct={false} />}
        </div>
        {ok === false && correct && (
          <p className="mt-3 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-800">
            Đáp án đúng: <strong>{correct[0]}</strong>
          </p>
        )}
      </div>

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
