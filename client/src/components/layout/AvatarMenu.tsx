import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
import { initials } from "./AppLayout";

interface AvatarMenuProps {
  name: string;
  email?: string;
  /** Đường dẫn tới Trang cá nhân, ví dụ "/student/account" */
  accountPath: string;
  onLogout: () => void;
  /** Mở sẵn menu (chỉ dùng khi kiểm thử) */
  defaultOpen?: boolean;
}

const ITEM =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25";

/** Bấm avatar ở thanh trên để mở menu nhỏ: Trang cá nhân, Đăng xuất. Đóng khi bấm ra ngoài hoặc Esc. */
export default function AvatarMenu({ name, email, accountPath, onLogout, defaultOpen = false }: AvatarMenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Mở menu thì đưa focus vào mục đầu tiên
  useEffect(() => {
    if (open && !defaultOpen) wrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, defaultOpen]);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === "ArrowDown") next = (index + 1) % items.length;
    else if (e.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else if (e.key === "Tab") setOpen(false);
    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Menu tài khoản của ${name}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="grid size-11 place-items-center rounded-full bg-linear-to-br from-indigo-200 to-violet-300 text-sm font-bold text-brand-dark transition-shadow hover:ring-4 hover:ring-brand/15 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
      >
        <span aria-hidden="true">{initials(name)}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Tài khoản"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-bold text-slate-900">{name}</p>
            {email && <p className="truncate text-xs text-slate-500">{email}</p>}
          </div>
          <div className="my-1 h-px bg-slate-100" role="separator" />
          <Link role="menuitem" to={accountPath} onClick={() => setOpen(false)} className={`${ITEM} text-slate-700 hover:bg-slate-50`}>
            <UserRound className="size-4" aria-hidden="true" />
            Trang cá nhân
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className={`${ITEM} text-red-600 hover:bg-red-50`}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
