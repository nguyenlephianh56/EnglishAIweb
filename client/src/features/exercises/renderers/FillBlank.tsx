import { Fragment, useId } from "react";
import { Check, Lightbulb } from "lucide-react";
import { BLANK_PATTERN, compareAnswer } from "../answerUtils";
import { BrokenContent, ExplanationBox } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Điền từ: tách text theo "___", mỗi chỗ trống là một ô nhập nằm ngay trong câu. */
export default function FillBlank({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"fill_blank">) {
  const uid = useId();
  const review = mode === "review";
  const locked = disabled || review;
  if (typeof content?.text !== "string") return <BrokenContent />;

  const parts = content.text.split(BLANK_PATTERN);
  const blankCount = parts.length - 1;
  const answers = Array.from({ length: blankCount }, (_, i) => value?.[i] ?? "");
  const correctAnswer = result?.correctAnswer;
  const verdict = review && correctAnswer ? compareAnswer("fill_blank", answers, correctAnswer) : undefined;

  function setAt(i: number, text: string) {
    const next = [...answers];
    next[i] = text;
    onChange(next);
  }

  return (
    <div>
      {content.hint && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-800">
          <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Gợi ý:</strong> {content.hint}
          </span>
        </p>
      )}

      <p className="text-[17px] leading-[3rem] text-slate-800">
        {parts.map((part, i) => (
          <Fragment key={i}>
            <span className="whitespace-pre-wrap">{part}</span>
            {i < blankCount && (
              <span className="mx-1 inline-flex items-center gap-1 align-middle">
                <input
                  id={`${uid}-${i}`}
                  type="text"
                  value={answers[i]}
                  disabled={locked}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-label={`Chỗ trống số ${i + 1}`}
                  aria-invalid={verdict && !verdict[i] ? true : undefined}
                  onChange={(e) => setAt(i, e.target.value)}
                  className={`h-10 w-36 rounded-lg border-2 px-3 text-center text-[15px] font-semibold outline-none transition-colors focus:ring-4 disabled:cursor-default ${
                    verdict
                      ? verdict[i]
                        ? "border-green-500 bg-green-50 text-green-800 focus:ring-green-500/20"
                        : "border-red-500 bg-red-50 text-red-700 focus:ring-red-500/20"
                      : "border-slate-300 bg-white text-slate-900 focus:border-brand focus:ring-brand/20 disabled:bg-slate-50"
                  }`}
                />
                {verdict?.[i] && <Check className="size-5 text-green-600" aria-label="Đúng" />}
                {verdict && !verdict[i] && correctAnswer && (
                  <span className="rounded-lg bg-green-50 px-2 py-1 text-sm font-bold text-green-700">
                    <span className="sr-only">Đáp án đúng: </span>
                    {correctAnswer[i]}
                  </span>
                )}
              </span>
            )}
          </Fragment>
        ))}
      </p>

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
