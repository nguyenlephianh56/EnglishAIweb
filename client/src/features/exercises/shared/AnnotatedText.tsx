import { useMemo, useState } from "react";
import { errorGroup, errorLabel, locateErrors } from "./errorUtils";
import type { WritingErrorItem } from "./errorUtils";

export interface AnnotatedTextProps {
  text: string;
  errors: WritingErrorItem[];
  /** Lỗi đang được chọn (đồng bộ với ErrorList). Bỏ trống thì component tự giữ trạng thái. */
  activeIndex?: number | null;
  onActiveChange?: (index: number | null) => void;
  /** Tiền tố id để ErrorList tìm đoạn tương ứng (mặc định "err") */
  idPrefix?: string;
}

export const markId = (prefix: string, i: number) => `${prefix}-mark-${i}`;
export const itemId = (prefix: string, i: number) => `${prefix}-item-${i}`;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function scrollToId(id: string, block: ScrollLogicalPosition, focus: boolean) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ block, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  if (focus) el.focus({ preventScroll: true });
}

/** Chi tiết một lỗi trong chú giải (nền tối) */
function Tip({ id, err }: { id: string; err: WritingErrorItem }) {
  return (
    <span
      role="tooltip"
      id={id}
      className="absolute left-0 top-full z-20 mt-1.5 block w-max max-w-[18rem] whitespace-normal rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg"
    >
      <span className="block font-bold text-amber-300">{errorLabel(err.type)}</span>
      <span className="mt-0.5 block font-semibold">
        <span className="text-red-300 line-through decoration-red-300/70">{err.text}</span>
        {err.correction ? (
          <>
            <span className="mx-1.5 text-slate-400" aria-label="sửa thành">
              →
            </span>
            <span className="text-green-300">{err.correction}</span>
          </>
        ) : null}
      </span>
      {err.explanation ? <span className="mt-1 block text-slate-200">{err.explanation}</span> : null}
    </span>
  );
}

/**
 * Bài viết với các đoạn lỗi gạch đỏ lượn sóng kèm số nhỏ. Mỗi đoạn lỗi là <button>: rê, bấm hoặc focus để xem chú giải
 * (loại lỗi, "<sai> → <đúng>", giải thích). Giữ xuống dòng. Lỗi không tìm thấy trong bài nằm ở khối "Lỗi khác" bên dưới.
 */
export default function AnnotatedText({ text, errors, activeIndex, onActiveChange, idPrefix = "err" }: AnnotatedTextProps) {
  const [innerActive, setInnerActive] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const controlled = activeIndex !== undefined;
  const active = controlled ? activeIndex : innerActive;
  const { segments, unplaced } = useMemo(() => locateErrors(text, errors), [text, errors]);

  function setActive(i: number | null) {
    if (!controlled) setInnerActive(i);
    onActiveChange?.(i);
  }
  function select(i: number) {
    const next = active === i ? null : i;
    setActive(next);
    if (next !== null) scrollToId(itemId(idPrefix, i), "nearest", false);
  }

  return (
    <div>
      <div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-[15px] leading-8 text-slate-800">
        {segments.map((s, k) => {
          if (s.kind === "plain" || s.errorIndex === undefined) return <span key={k}>{s.text}</span>;
          const i = s.errorIndex;
          const shown = hover === i || active === i;
          const tipId = `${idPrefix}-tip-${i}`;
          return (
            <span key={k} className="relative">
              <button
                type="button"
                id={markId(idPrefix, i)}
                aria-describedby={shown ? tipId : undefined}
                aria-label={`Lỗi ${i + 1}: ${s.text}. ${errorGroup(errors[i].type).label}`}
                onClick={() => select(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onFocus={() => setHover(i)}
                onBlur={() => setHover((h) => (h === i ? null : h))}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setHover(null);
                    if (active === i) setActive(null);
                  }
                }}
                className={`whitespace-pre-wrap rounded-sm px-0.5 align-baseline text-left underline decoration-red-500 decoration-wavy decoration-2 underline-offset-4 transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-300 ${
                  active === i ? "bg-red-200" : "bg-red-50 hover:bg-red-100"
                }`}
              >
                {s.text}
                <sup className="ml-0.5 font-bold text-red-600">{i + 1}</sup>
              </button>
              {shown && <Tip id={tipId} err={errors[i]} />}
            </span>
          );
        })}
        {text === "" && <span className="text-slate-400">Không có nội dung bài viết.</span>}
      </div>

      {unplaced.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-900">Lỗi khác ({unplaced.length})</h3>
          <p className="mt-0.5 text-xs text-amber-800">Không xác định được vị trí của những lỗi này trong bài.</p>
          <ul className="mt-3 space-y-2">
            {unplaced.map((i) => {
              const e = errors[i];
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => setActive(active === i ? null : i)}
                    aria-pressed={active === i}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 ${active === i ? "bg-white shadow-sm" : "hover:bg-amber-100"}`}
                  >
                    <span className="font-bold text-slate-900">
                      <span className="mr-2 text-xs text-red-600">{i + 1}</span>
                      {e.text ? <span className="text-red-600 line-through decoration-red-300">{e.text}</span> : <span className="text-slate-500">(không có đoạn trích)</span>}
                      {e.correction ? (
                        <>
                          <span className="mx-2 text-slate-400" aria-label="sửa thành">
                            →
                          </span>
                          <span className="text-green-700">{e.correction}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs font-semibold text-slate-500">{errorLabel(e.type)}</span>
                    {e.explanation && active === i ? <span className="mt-1 block text-slate-600">{e.explanation}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
