import { Fragment, useId, useState } from "react";
import { Check, Eye, EyeOff } from "lucide-react";
import AudioPlayer from "../AudioPlayer";
import ListeningAudioPlayer from "../ListeningAudioPlayer";
import { BLANK_PATTERN, compareAnswer } from "../answerUtils";
import { BrokenContent, ExplanationBox } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

/** Điền các đáp án đúng vào chỗ "___" lần lượt, để hiện bản đầy đủ khi không có `spoken` */
function fillScript(script: string, answers: string[]): string {
  let i = 0;
  return script.replace(BLANK_PATTERN, () => answers[i++] ?? "___");
}

/**
 * Nghe điền từ: nghe `content.spoken` bằng AudioPlayer, điền các chỗ trống "___" của `content.script` theo thứ tự 1..n.
 * Số "___" khớp `blanks` thì ô nhập nằm ngay tại chỗ trống; không khớp thì script hiện số thứ tự và các ô nhập xếp bên dưới.
 */
export default function ListeningFill({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"listening_fill">) {
  const uid = useId();
  const [showFull, setShowFull] = useState(false);
  const review = mode === "review";
  const locked = disabled || review;
  const n = typeof content?.blanks === "number" && content.blanks > 0 ? Math.floor(content.blanks) : 0;
  if (typeof content?.script !== "string" || n === 0) return <BrokenContent />;

  const parts = content.script.split(BLANK_PATTERN);
  const marks = parts.length - 1;
  const inline = marks === n;
  const answers = Array.from({ length: n }, (_, i) => value?.[i] ?? "");
  const correct = result?.correctAnswer;
  const verdict = review && correct ? compareAnswer("listening_fill", answers, correct) : undefined;
  const spoken = typeof content.spoken === "string" && content.spoken.trim() ? content.spoken : undefined;
  const canFill = inline && correct?.length === n && correct.every(answer => answer.trim() !== "");
  const fullText = correct ? spoken ?? (canFill ? fillScript(content.script, correct) : undefined) : undefined;

  function setAt(i: number, text: string) {
    const next = [...answers];
    next[i] = text;
    onChange(next);
  }

  const badge = (i: number) => (
    <span
      className={`grid size-7 shrink-0 place-items-center rounded-lg text-sm font-bold ${verdict ? (verdict[i] ? "bg-green-500 text-white" : "bg-red-500 text-white") : "bg-brand-light text-brand"}`}
      aria-hidden="true"
    >
      {i + 1}
    </span>
  );

  const input = (i: number, width: string) => (
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
      className={`h-10 ${width} rounded-lg border-2 px-3 text-base sm:text-[15px] font-semibold outline-none transition-colors focus:ring-4 disabled:cursor-default ${
        verdict
          ? verdict[i]
            ? "border-green-500 bg-green-50 text-green-800 focus:ring-green-500/20"
            : "border-red-500 bg-red-50 text-red-700 focus:ring-red-500/20"
          : "border-slate-300 bg-white text-slate-900 focus:border-brand focus:ring-brand/20 disabled:bg-slate-50"
      }`}
    />
  );

  const feedback = (i: number) => (
    <>
      {verdict?.[i] && <Check className="size-5 text-green-600" aria-label="Đúng" />}
      {verdict && !verdict[i] && correct && (
        <span className="rounded-lg bg-green-50 px-2 py-1 text-sm font-bold text-green-700">
          <span className="sr-only">Đáp án đúng: </span>
          {correct[i]}
        </span>
      )}
    </>
  );

  return (
    <div>
      {content.audioPath
        ? <ListeningAudioPlayer key={content.audioPath} path={content.audioPath} />
        : <AudioPlayer spoken={fullText ?? spoken} />}

      <p className="mb-3 mt-6 text-sm font-semibold text-slate-500">Nghe và điền từ còn thiếu vào {n} chỗ trống, theo đúng thứ tự nghe được.</p>

      {inline ? (
        <p className="text-[17px] leading-[3rem] text-slate-800">
          {parts.map((part, i) => (
            <Fragment key={i}>
              <span className="whitespace-pre-wrap">{part}</span>
              {i < n && (
                <span className="mx-1 inline-flex items-center gap-1.5 align-middle">
                  {badge(i)}
                  {input(i, "w-36")}
                  {feedback(i)}
                </span>
              )}
            </Fragment>
          ))}
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-[17px] leading-8 text-slate-800">
            {parts.map((part, i) => (
              <Fragment key={i}>
                {part}
                {i < marks && (
                  <span className="mx-1 inline-grid size-6 place-items-center rounded-md bg-brand-light align-middle text-xs font-bold text-brand">
                    {i + 1}
                    <span className="sr-only"> (chỗ trống)</span>
                  </span>
                )}
              </Fragment>
            ))}
          </p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-2">
            {answers.map((_, i) => (
              <li key={i} className="flex items-center gap-2">
                {badge(i)}
                <span className="min-w-0 flex-1">{input(i, "w-full")}</span>
                {feedback(i)}
              </li>
            ))}
          </ol>
        </>
      )}

      {review && fullText && (
        <div className="mt-6">
          <button
            type="button"
            aria-expanded={showFull}
            onClick={() => setShowFull((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
          >
            {showFull ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
            {showFull ? "Ẩn lời đọc" : "Xem lời đọc đầy đủ"}
          </button>
          {showFull && <p className="mt-3 whitespace-pre-line rounded-2xl bg-slate-50 p-4 text-[15px] leading-7 text-slate-800">{fullText}</p>}
        </div>
      )}

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}