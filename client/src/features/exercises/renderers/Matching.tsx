import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MatchingValue } from "../../../types/exercise";
import { BrokenContent, ExplanationBox, optionLetter, ReviewBadge } from "./ReviewParts";
import type { ExerciseRendererProps } from "../rendererTypes";

interface Line {
  l: number;
  r: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const COLOR = { neutral: "#4F46E5", ok: "#16A34A", bad: "#EF4444" };

/**
 * Nối cặp: bấm một mục bên trái rồi một mục bên phải để nối (Enter/Space với bàn phím); vẽ đường nối SVG.
 * Bấm mục (hoặc đường) của cặp đã nối, khi chưa chọn mục nào, để bỏ cặp đó.
 */
export default function Matching({ content, value, onChange, mode, disabled, result }: ExerciseRendererProps<"matching">) {
  const review = mode === "review";
  const locked = Boolean(disabled) || review;
  const boxRef = useRef<HTMLDivElement>(null);
  const leftRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const rightRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pending, setPending] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);

  const left = Array.isArray(content?.left) ? content.left : null;
  const right = Array.isArray(content?.right) ? content.right : null;
  const pairs: MatchingValue = Array.isArray(value) ? value.filter((p) => Array.isArray(p) && p.length === 2) : [];
  const pairsKey = pairs.map((p) => p.join("-")).join(",");

  const correctSet = review && result?.correctAnswer ? new Set(result.correctAnswer.map(([l, r]) => `${l}-${r}`)) : null;
  const verdictOf = (l: number, r: number): "ok" | "bad" | "neutral" => (correctSet ? (correctSet.has(`${l}-${r}`) ? "ok" : "bad") : "neutral");

  const measure = useCallback(() => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return;
    const next: Line[] = [];
    for (const [l, r] of pairs) {
      const a = leftRefs.current[l]?.getBoundingClientRect();
      const b = rightRefs.current[r]?.getBoundingClientRect();
      if (!a || !b) continue;
      next.push({ l, r, x1: a.right - box.left, y1: a.top + a.height / 2 - box.top, x2: b.left - box.left, y2: b.top + b.height / 2 - box.top });
    }
    setLines(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairsKey]);

  // Tính lại đường nối khi cặp đổi, nội dung đổi, hoặc khung đổi kích thước (xoay màn hình, xuống dòng chữ...)
  useLayoutEffect(() => {
    measure();
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, left?.length, right?.length]);

  if (!left || !right) return <BrokenContent />;

  const pairedRightOf = (l: number) => pairs.find((p) => p[0] === l)?.[1];
  const pairedLeftOf = (r: number) => pairs.find((p) => p[1] === r)?.[0];
  const sorted = (list: MatchingValue): MatchingValue => [...list].sort((a, b) => a[0] - b[0]);
  const removePair = (l: number) => onChange(sorted(pairs.filter((p) => p[0] !== l)));

  function clickLeft(l: number) {
    if (locked) return;
    if (pending === l) return setPending(null);
    if (pending === null && pairedRightOf(l) !== undefined) return removePair(l);
    setPending(l);
  }

  function clickRight(r: number) {
    if (locked) return;
    if (pending === null) {
      const owner = pairedLeftOf(r);
      if (owner !== undefined) removePair(owner);
      return;
    }
    onChange(sorted([...pairs.filter((p) => p[0] !== pending && p[1] !== r), [pending, r]]));
    setPending(null);
  }

  const itemClass = (active: boolean, verdict: "ok" | "bad" | "neutral" | null) => {
    let c = "border-slate-200 bg-white hover:bg-slate-50";
    if (verdict === "ok") c = "border-green-500 bg-green-50";
    else if (verdict === "bad") c = "border-red-500 bg-red-50";
    else if (verdict === "neutral") c = "border-brand bg-brand-light/70";
    if (active) c = "border-brand bg-brand-light ring-4 ring-brand/20";
    return `flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left text-[15px] text-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:cursor-default ${c}`;
  };

  const status = review
    ? ""
    : pending !== null
      ? `Đã chọn mục ${pending + 1} bên trái. Hãy chọn một mục bên phải để nối.`
      : pairs.length > 0
        ? `Đã nối ${pairs.length}/${left.length} cặp. Bấm một cặp đã nối để bỏ.`
        : "Chọn một mục bên trái, rồi chọn mục bên phải để nối.";

  const missed = review && result?.correctAnswer ? result.correctAnswer.filter(([l, r]) => !pairs.some(([pl, pr]) => pl === l && pr === r)) : [];

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-500" role="status" aria-live="polite">
        {status || "Các cặp đã nối được tô màu: xanh là đúng, đỏ là sai."}
      </p>

      <div ref={boxRef} className="relative flex items-start">
        <ul className="min-w-0 flex-1 space-y-3" aria-label="Cột trái">
          {left.map((text, l) => {
            const r = pairedRightOf(l);
            const verdict = r !== undefined ? verdictOf(l, r) : null;
            const hint = r !== undefined ? `, đã nối với mục ${optionLetter(r)}${locked ? "" : ". Nhấn để bỏ nối"}` : "";
            return (
              <li key={l}>
                <button
                  ref={(el) => {
                    leftRefs.current[l] = el;
                  }}
                  type="button"
                  disabled={locked}
                  aria-pressed={pending === l}
                  aria-label={`Mục ${l + 1}: ${text}${hint}`}
                  onClick={() => clickLeft(l)}
                  className={itemClass(pending === l, verdict)}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">
                    {l + 1}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{text}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="w-12 shrink-0 sm:w-24" aria-hidden="true" />

        <ul className="min-w-0 flex-1 space-y-3" aria-label="Cột phải">
          {right.map((text, r) => {
            const l = pairedLeftOf(r);
            const verdict = l !== undefined ? verdictOf(l, r) : null;
            const hint = l !== undefined ? `, đã nối với mục ${l + 1}${locked ? "" : ". Nhấn để bỏ nối"}` : "";
            return (
              <li key={r}>
                <button
                  ref={(el) => {
                    rightRefs.current[r] = el;
                  }}
                  type="button"
                  disabled={locked}
                  aria-label={`Mục ${optionLetter(r)}: ${text}${hint}`}
                  onClick={() => clickRight(r)}
                  className={itemClass(false, verdict)}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600" aria-hidden="true">
                    {optionLetter(r)}
                  </span>
                  <span className="min-w-0 flex-1 break-words">{text}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden="true" focusable="false">
          {lines.map((ln) => {
            const color = COLOR[verdictOf(ln.l, ln.r)];
            return (
              <g key={`${ln.l}-${ln.r}`}>
                <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke={color} strokeWidth={3} strokeLinecap="round" />
                <circle cx={ln.x1} cy={ln.y1} r={4} fill={color} />
                <circle cx={ln.x2} cy={ln.y2} r={4} fill={color} />
                {!locked && <line x1={ln.x1} y1={ln.y1} x2={ln.x2} y2={ln.y2} stroke="transparent" strokeWidth={16} className="pointer-events-auto cursor-pointer" onClick={() => removePair(ln.l)} />}
              </g>
            );
          })}
        </svg>
      </div>

      {review && correctSet && (
        <div className="mt-6 space-y-2">
          {pairs.length > 0 && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <ReviewBadge correct>{`${pairs.filter(([l, r]) => correctSet.has(`${l}-${r}`)).length} cặp đúng`}</ReviewBadge>
              {pairs.some(([l, r]) => !correctSet.has(`${l}-${r}`)) && <ReviewBadge correct={false}>{`${pairs.filter(([l, r]) => !correctSet.has(`${l}-${r}`)).length} cặp sai`}</ReviewBadge>}
            </p>
          )}
          {missed.length > 0 && (
            <div className="rounded-2xl bg-green-50 p-4 text-sm text-green-900">
              <p className="font-bold">Đáp án đúng</p>
              <ul className="mt-1 space-y-1">
                {missed.map(([l, r]) => (
                  <li key={`${l}-${r}`}>
                    {l + 1}. {left[l]} <span aria-label="nối với">↔</span> {optionLetter(r)}. {right[r]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {review && <ExplanationBox text={result?.explanation} />}
    </div>
  );
}
