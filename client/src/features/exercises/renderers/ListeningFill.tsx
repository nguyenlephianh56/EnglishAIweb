import { useId } from "react";
import { Check } from "lucide-react";
import AudioPlayer from "../AudioPlayer";
import { compareAnswer } from "../answerUtils";
import { BrokenContent, ExplanationBox } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Nghe điền từ: nghe script (chữ được ẩn) bằng AudioPlayer, rồi điền `blanks` chỗ trống theo thứ tự 1..n. */
export default function ListeningFill({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"listening_fill">) {
  const uid = useId();
  const review = mode === "review";
  const locked = disabled || review;
  const n = typeof content?.blanks === "number" && content.blanks > 0 ? Math.floor(content.blanks) : 0;
  if (typeof content?.script !== "string" || n === 0) return <BrokenContent />;

  const answers = Array.from({ length: n }, (_, i) => value?.[i] ?? "");
  const correct = result?.correctAnswer;
  const verdict = review && correct ? compareAnswer("listening_fill", answers, correct) : undefined;

  function setAt(i: number, text: string) {
    const next = [...answers];
    next[i] = text;
    onChange(next);
  }

  return (
    <div>
      <AudioPlayer script={content.script} />

      <p className="mb-3 mt-6 text-sm font-semibold text-slate-500">Nghe và điền từ còn thiếu vào {n} chỗ trống, theo đúng thứ tự nghe được.</p>

      <ol className="grid gap-3 sm:grid-cols-2">
        {answers.map((a, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={`mt-1.5 grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${verdict ? (verdict[i] ? "bg-green-500 text-white" : "bg-red-500 text-white") : "bg-brand-light text-brand"}`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <input
                id={`${uid}-${i}`}
                type="text"
                value={a}
                disabled={locked}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-label={`Chỗ trống số ${i + 1}`}
                aria-invalid={verdict && !verdict[i] ? true : undefined}
                onChange={(e) => setAt(i, e.target.value)}
                className={`h-11 w-full rounded-xl border-2 px-3 text-[15px] outline-none transition-colors focus:ring-4 disabled:cursor-default ${
                  verdict
                    ? verdict[i]
                      ? "border-green-500 bg-green-50 text-green-800"
                      : "border-red-500 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-900 focus:border-brand focus:ring-brand/20 disabled:bg-slate-50"
                }`}
              />
              {verdict?.[i] && (
                <p className="mt-1 flex items-center gap-1 text-xs font-bold text-green-700">
                  <Check className="size-4" aria-hidden="true" />
                  Chính xác
                </p>
              )}
              {verdict && !verdict[i] && correct && (
                <p className="mt-1 text-xs font-bold text-green-700">
                  <span className="sr-only">Đáp án đúng: </span>
                  Đáp án: {correct[i]}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
