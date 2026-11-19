import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, MoreHorizontal, Pencil, Send, Trash2, UserPlus } from "lucide-react";
import type { ExerciseListItem } from "../../../types/exercise";

interface ExerciseRowMenuProps {
  exercise: ExerciseListItem;
  /** Bài do chính giáo viên này tạo (quyết định có "Gửi đề xuất" và "Xóa" hay không) */
  isOwner: boolean;
  busy: boolean;
  onPropose: (e: ExerciseListItem) => void;
  onDuplicate: (e: ExerciseListItem) => void;
  onDelete: (e: ExerciseListItem) => void;
}

const itemClass =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent";

/**
 * Menu "…" của một dòng. Dùng position: fixed để không bị bảng cuộn ngang (overflow) cắt mất;
 * đóng khi bấm ra ngoài, nhấn Esc, cuộn hoặc đổi cỡ cửa sổ.
 */
export default function ExerciseRowMenu({ exercise, isOwner, busy, onPropose, onDuplicate, onDelete }: ExerciseRowMenuProps) {
  const navigate = useNavigate();
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = pos !== null;

  const canAssign = exercise.status !== "HIDDEN" && exercise.type !== "speaking";
  const canPropose = isOwner && exercise.status === "DRAFT";

  function close(refocus = false) {
    setPos(null);
    if (refocus) triggerRef.current?.focus();
  }

  function toggle() {
    if (open) return close();
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setPos(null);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close(true);
    };
    const onMove = () => setPos(null);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Thao tác với bài “${exercise.topic}”`}
        disabled={busy}
        onClick={toggle}
        className="grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:text-slate-300"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={`Thao tác với bài “${exercise.topic}”`}
          onKeyDown={onMenuKeyDown}
          style={{ position: "fixed", top: pos.top, right: pos.right }}
          className="z-40 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
        >
          <button type="button" role="menuitem" disabled={!canAssign} title={canAssign ? undefined : "Bài đã ẩn hoặc dạng Nói chưa giao được"} onClick={run(() => navigate(`/teacher/assignments/new?exerciseId=${exercise.id}`))} className={itemClass}>
            <UserPlus className="size-4 shrink-0" aria-hidden="true" />
            Giao bài
          </button>
          {canPropose && (
            <button type="button" role="menuitem" onClick={run(() => onPropose(exercise))} className={itemClass}>
              <Send className="size-4 shrink-0" aria-hidden="true" />
              Gửi đề xuất vào thư viện
            </button>
          )}
          <button type="button" role="menuitem" onClick={run(() => onDuplicate(exercise))} className={itemClass}>
            <Copy className="size-4 shrink-0" aria-hidden="true" />
            Nhân bản
          </button>
          <button type="button" role="menuitem" onClick={run(() => navigate(`/teacher/exercises/${exercise.id}/review`))} className={itemClass}>
            <Pencil className="size-4 shrink-0" aria-hidden="true" />
            Xem / Sửa
          </button>
          {isOwner && (
            <>
              <div className="my-1 border-t border-slate-100" role="separator" />
              <button type="button" role="menuitem" onClick={run(() => onDelete(exercise))} className={`${itemClass} text-red-600 hover:bg-red-50 focus-visible:bg-red-50`}>
                <Trash2 className="size-4 shrink-0" aria-hidden="true" />
                Xóa
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
