import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, CircleAlert } from "lucide-react";
import Button from "../../../components/ui/Button";
import NotificationItem from "./NotificationItem";
import { groupByDay } from "./notificationMeta";
import { useNotificationActions, useNotificationFeed } from "./useNotificationFeed";
import type { NotificationSource } from "./notificationSource";
import { formatNumber } from "../../../utils/format";
import type { AppNotification } from "../../../types/notification";

type Tab = "all" | "unread";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "unread", label: "Chưa đọc" },
];

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** Trang Thông báo dùng chung cho mọi vai trò: khác nhau ở `source` (dữ liệu, đường dẫn, phụ đề). */
export default function NotificationsPage({ source }: { source: NotificationSource }) {
  const navigate = useNavigate();
  const { items, unread, isLoading, isError, refetch } = useNotificationFeed(source);
  const { markRead, markAllRead, markingAll } = useNotificationActions(source);
  const [tab, setTab] = useState<Tab>("all");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const now = new Date();
  const visible = tab === "unread" ? items.filter((n) => !n.read) : items;
  const groups = groupByDay(visible, now);
  const counts: Record<Tab, number> = { all: items.length, unread };

  function handleOpen(item: AppNotification) {
    if (!item.read) markRead(item.id);
    navigate(item.to);
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Thông báo</h1>
          <p className="mt-2 text-slate-500">{source.pageDescription}</p>
        </div>
        <Button variant="outline" leftIcon={<CheckCheck />} disabled={unread === 0 || markingAll} onClick={() => markAllRead()}>
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      <div role="tablist" aria-label="Lọc thông báo" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`noti-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="noti-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKeyDown}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
              <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>
                {isLoading ? "…" : formatNumber(counts[t.id])}
              </span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="noti-panel" aria-labelledby={`noti-tab-${tab}`} className="mt-6">
        {isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được thông báo.
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Thử lại
            </Button>
          </div>
        ) : isLoading ? (
          <div className="space-y-3" role="status" aria-label="Đang tải">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              {tab === "unread" ? <BellOff className="size-6" /> : <Bell className="size-6" />}
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">{tab === "unread" ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo nào"}</p>
            <p className="mt-1 text-sm text-slate-500">{tab === "unread" ? "Thông báo mới sẽ hiện ở đây khi có." : source.emptyDescription}</p>
            {tab === "unread" && items.length > 0 && (
              <div className="mt-5">
                <Button variant="outline" onClick={() => setTab("all")}>
                  Xem tất cả thông báo
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`noti-group-${g.key}`}>
                <h2 id={`noti-group-${g.key}`} className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {g.label}
                </h2>
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <NotificationItem item={n} now={now} onOpen={handleOpen} label={source.typeLabels?.[n.type]} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
