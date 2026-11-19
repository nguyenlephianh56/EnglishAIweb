import { useMemo, useState } from "react";
import { ERROR_GROUPS, errorDetail, errorGroup, locateErrors } from "./errorUtils";
import type { ErrorGroupKey, WritingErrorItem } from "./errorUtils";
import { itemId, markId } from "./AnnotatedText";

export interface ErrorListProps {
  errors: WritingErrorItem[];
  /** Bài viết, để biết lỗi nào không định vị được (không bắt buộc) */
  text?: string;
  activeIndex?: number | null;
  onActiveChange?: (index: number | null) => void;
  idPrefix?: string;
  /** Hiện khi errors rỗng */
  emptyText?: string;
}

/** Danh sách lỗi theo nhóm (Ngữ pháp, Từ vựng, Chính tả, Dấu câu, Khác) có chip lọc kèm số đếm. Bấm một lỗi thì cuộn tới đoạn trong bài. */
export default function ErrorList({ errors, text, activeIndex = null, onActiveChange, idPrefix = "err", emptyText = "AI không phát hiện lỗi nào trong bài." }: ErrorListProps) {
  const [filter, setFilter] = useState<ErrorGroupKey | "all">("all");
  const unplaced = useMemo(() => (text === undefined ? new Set<number>() : new Set(locateErrors(text, errors).unplaced)), [text, errors]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of errors) c[errorGroup(e.type).key] = (c[errorGroup(e.type).key] ?? 0) + 1;
    return c;
  }, [errors]);
  const groups = ERROR_GROUPS.filter((g) => counts[g.key]);

  if (errors.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;

  function pick(i: number) {
    const next = activeIndex === i ? null : i;
    onActiveChange?.(next);
    if (next !== null) {
      const el = document.getElementById(markId(idPrefix, i));
      if (el) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
        el.focus({ preventScroll: true });
      }
    }
  }

  const chip = (selected: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <div>
      {groups.length > 1 && (
        <div role="group" aria-label="Lọc lỗi theo nhóm" className="mb-4 flex flex-wrap gap-2">
          <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            Tất cả ({errors.length})
          </button>
          {groups.map((g) => (
            <button key={g.key} type="button" aria-pressed={filter === g.key} onClick={() => setFilter(g.key)} className={chip(filter === g.key)}>
              {g.label} ({counts[g.key]})
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {errors.map((e, i) => {
          if (filter !== "all" && errorGroup(e.type).key !== filter) return null;
          const detail = errorDetail(e.type);
          const active = activeIndex === i;
          return (
            <li key={i} id={itemId(idPrefix, i)}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => pick(i)}
                className={`flex w-full gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 ${active ? "border-red-300 bg-red-50/60" : "border-slate-100 hover:bg-slate-50"}`}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-bold text-red-600">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900">
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
                  {e.explanation ? <span className="mt-1 block text-sm text-slate-600">{e.explanation}</span> : null}
                  <span className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">{errorGroup(e.type).label}</span>
                    {detail && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-500">{detail}</span>}
                    {unplaced.has(i) && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-amber-700">Không xác định được vị trí trong bài</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
