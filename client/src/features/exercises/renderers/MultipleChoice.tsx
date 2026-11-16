import { useId } from "react";
import { ExplanationBox, ReviewBadge, BrokenContent, optionLetter } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Trắc nghiệm: passage (nếu có) rồi từng câu; mỗi câu là một nhóm radio (điều khiển bằng bàn phím: mũi tên, Tab). */
export default function MultipleChoice({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"multiple_choice">) {
  const uid = useId();
  const review = mode === "review";
  const locked = disabled || review;
  const questions = Array.isArray(content?.questions) ? content.questions : null;
  if (!questions) return <BrokenContent />;

  const chosen = (qi: number) => (typeof value?.[qi] === "number" ? value[qi] : -1);

  function pick(qi: number, oi: number) {
    const next = questions!.map((_, i) => chosen(i));
    next[qi] = oi;
    onChange(next);
  }

  return (
    <div>
      {content.passage && (
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Đoạn văn</p>
          <p className="whitespace-pre-line text-[15px] leading-7 text-slate-800">{content.passage}</p>
        </div>
      )}

      <div className="space-y-6">
        {questions.map((q, qi) => {
          const selected = chosen(qi);
          const correct = result?.correctAnswer?.[qi];
          const hasCorrect = review && typeof correct === "number" && correct >= 0;
          return (
            <fieldset key={qi} className="min-w-0" disabled={locked}>
              <legend className="mb-3 text-base font-bold text-slate-900">
                <span className="mr-2 text-brand">Câu {qi + 1}.</span>
                {q.q}
              </legend>
              <div className="space-y-2.5">
                {q.options.map((opt, oi) => {
                  const isSelected = selected === oi;
                  const isCorrect = hasCorrect && correct === oi;
                  const isWrongPick = review && hasCorrect && isSelected && correct !== oi;
                  let style = "border-slate-200 bg-white hover:bg-slate-50";
                  if (isCorrect) style = "border-green-500 bg-green-50";
                  else if (isWrongPick) style = "border-red-500 bg-red-50";
                  else if (isSelected) style = "border-brand bg-brand-light/70";
                  const letterStyle = isCorrect ? "bg-green-500 text-white" : isWrongPick ? "bg-red-500 text-white" : isSelected ? "bg-brand text-white" : "bg-slate-100 text-slate-600";
                  return (
                    <label key={oi} className={`block ${locked ? "cursor-default" : "cursor-pointer"}`}>
                      <input
                        type="radio"
                        name={`${uid}-q${qi}`}
                        checked={isSelected}
                        disabled={locked}
                        onChange={() => pick(qi, oi)}
                        className="peer sr-only"
                      />
                      <span className={`flex items-center gap-3 rounded-2xl border-2 p-3.5 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 ${style}`}>
                        <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${letterStyle}`} aria-hidden="true">
                          {optionLetter(oi)}
                        </span>
                        <span className="sr-only">{`Lựa chọn ${optionLetter(oi)}: `}</span>
                        <span className="min-w-0 flex-1 text-[15px] text-slate-800">{opt}</span>
                        {isCorrect && <ReviewBadge correct />}
                        {isWrongPick && <ReviewBadge correct={false} />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
