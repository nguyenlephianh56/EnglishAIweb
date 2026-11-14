import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import NotificationItem from "./NotificationItem";
import { useNotificationActions, useNotificationFeed } from "./useNotificationFeed";
import type { NotificationSource } from "./notificationSource";
import type { AppNotification } from "../../../types/notification";

const MAX_IN_MENU = 5;

/** Chuông ở thanh trên: bấm mở cửa sổ nhỏ 5 thông báo mới nhất + "Xem tất cả". Đóng khi bấm ra ngoài hoặc Esc. */
export default function NotificationBell({ source }: { source: NotificationSource }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const navigate = useNavigate();
  const { items, unread, isLoading, isError } = useNotificationFeed(source);
  const { markRead } = useNotificationActions(source);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
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

  function handleOpen(item: AppNotification) {
    setOpen(false);
    if (!item.read) markRead(item.id);
    navigate(item.to);
  }

  const latest = items.slice(0, MAX_IN_MENU);
  const now = new Date();

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && <span className="absolute right-2.5 top-2.5 size-2.5 rounded-full border-2 border-white bg-red-500" aria-hidden="true" />}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Thông báo"
          className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-6rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <p className="font-heading text-sm font-bold text-slate-900">Thông báo</p>
            {unread > 0 && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">{unread} mới</span>}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {isLoading ? (
              <div className="space-y-3 p-4" role="status" aria-label="Đang tải">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : isError ? (
              <p role="alert" className="px-4 py-6 text-center text-sm font-semibold text-red-600">
                Không tải được thông báo.
              </p>
            ) : latest.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">Chưa có thông báo nào.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {latest.map((n) => (
                  <li key={n.id}>
                    <NotificationItem item={n} now={now} onOpen={handleOpen} compact label={source.typeLabels?.[n.type]} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Link
            to={source.basePath}
            onClick={() => setOpen(false)}
            className="block border-t border-slate-100 px-4 py-3 text-center text-sm font-bold text-brand hover:bg-brand-light/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/25"
          >
            Xem tất cả thông báo
          </Link>
        </div>
      )}
    </div>
  );
}
