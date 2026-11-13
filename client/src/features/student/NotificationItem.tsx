import { NOTIFICATION_META, formatRelativeTime } from "./notificationMeta";
import type { AppNotification } from "../../types/notification";

interface NotificationItemProps {
  item: AppNotification;
  now: Date;
  onOpen: (item: AppNotification) => void;
  /** Dạng gọn dùng trong cửa sổ nhỏ ở chuông */
  compact?: boolean;
}

/** Một dòng thông báo: icon theo loại, tiêu đề, mô tả, thời gian, chấm xanh nếu chưa đọc. Dùng ở trang Thông báo và ở chuông. */
export default function NotificationItem({ item, now, onOpen, compact = false }: NotificationItemProps) {
  const meta = NOTIFICATION_META[item.type];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`flex w-full items-start gap-3 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand/25 ${
        compact ? "px-4 py-3" : "px-5 py-4 sm:px-6"
      } ${item.read ? "" : "bg-brand-light/40"}`}
    >
      <span className={`grid shrink-0 place-items-center rounded-xl ${meta.tint} ${meta.text} ${compact ? "size-9" : "size-11"}`} aria-hidden="true">
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="sr-only">{meta.label}: </span>
        <span className={`block text-sm ${item.read ? "font-semibold text-slate-700" : "font-bold text-slate-900"}`}>{item.title}</span>
        <span className={`mt-0.5 block text-sm text-slate-500 ${compact ? "line-clamp-1" : ""}`}>{item.description}</span>
        <span className="mt-1 block text-xs font-medium text-slate-400">{formatRelativeTime(item.createdAt, now)}</span>
      </span>
      {!item.read && (
        <>
          <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span className="sr-only">Chưa đọc</span>
        </>
      )}
    </button>
  );
}
