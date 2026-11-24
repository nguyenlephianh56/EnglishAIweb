import { Fragment, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, CircleAlert, ClipboardList, Loader2 } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { formatDate, formatTime } from "../../utils/format";
import { AUDIT_ACTION_LABEL, auditActionLabel } from "./aiMeta";
import { useAdminUsers } from "./useAdminData";
import { useAuditLogs } from "./useAdminAi";
import type { AuditFilters } from "./useAdminAi";
import type { AuditLogItem } from "../../types/adminAi";

const SELECT = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20";
const th = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** "yyyy-MM-dd" (giờ địa phương) -> ISO 8601 có múi giờ: đầu ngày hoặc cuối ngày */
function toIso(day: string, end: boolean): string | undefined {
  if (!DATE_RE.test(day)) return undefined;
  const [y, m, d] = day.split("-").map(Number);
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${formatDate(d)} ${formatTime(d)}`;
};

/** Tóm tắt detail thành vài cặp "khóa: giá trị" */
function summarize(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail ?? {});
  if (entries.length === 0) return "—";
  const text = entries
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v !== null && typeof v === "object" ? "…" : String(v)}`)
    .join(" • ");
  const out = entries.length > 3 ? `${text} • …` : text;
  return out.length > 120 ? `${out.slice(0, 117)}…` : out;
}

function LogRow({ log }: { log: AuditLogItem }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Object.keys(log.detail ?? {}).length > 0;
  return (
    <Fragment>
      <tr className="align-top transition-colors hover:bg-slate-50/60">
        <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatWhen(log.created_at)}</td>
        <td className="px-4 py-4 font-semibold text-slate-900">{log.user ? log.user.name : <span className="text-slate-500">Hệ thống</span>}</td>
        <td className="px-4 py-4">
          <span className="inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-bold text-brand-dark" title={log.action}>
            {auditActionLabel(log.action)}
          </span>
        </td>
        <td className="max-w-sm px-4 py-4 text-slate-600">
          <p className="break-words">{summarize(log.detail)}</p>
        </td>
        <td className="px-4 py-4 text-right">
          {hasDetail && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Thu gọn chi tiết" : "Xem chi tiết"}
              onClick={() => setOpen((v) => !v)}
              className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-slate-50 px-4 pb-4 pt-0">
            <pre className="max-h-80 overflow-auto rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs leading-5 text-slate-700">{JSON.stringify(log.detail, null, 2)}</pre>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

/** /admin/logs: nhật ký thao tác quản trị (audit log), lọc theo hành động, người dùng, khoảng ngày. */
export default function LogsPage() {
  const [params, setParams] = useSearchParams();
  const action = params.get("action") ?? "";
  const userParam = Number.parseInt(params.get("user_id") ?? "", 10);
  const userId = Number.isFinite(userParam) && userParam > 0 ? userParam : undefined;
  const fromDay = params.get("from") ?? "";
  const toDay = params.get("to") ?? "";

  const rangeError = DATE_RE.test(fromDay) && DATE_RE.test(toDay) && fromDay > toDay ? "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." : undefined;
  const filters: AuditFilters = {
    action: action || undefined,
    userId,
    from: toIso(fromDay, false),
    to: toIso(toDay, true),
  };
  const list = useAuditLogs(filters, !rangeError);
  const users = useAdminUsers();
  const sortedUsers = [...(users.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const logs = list.data?.pages.flatMap((p) => p.items) ?? [];
  const hasFilters = Boolean(action || userId || fromDay || toDay);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Nhật ký</h1>
      <p className="mt-2 text-slate-500">Lịch sử các thao tác quản trị: duyệt bài, sửa prompt, đổi giới hạn AI... Thông tin nhạy cảm đã được ẩn.</p>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Bộ lọc nhật ký">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="log-action" className="mb-1.5 block text-sm font-bold text-slate-900">
              Hành động
            </label>
            <select id="log-action" value={action} onChange={(e) => setParam("action", e.target.value)} className={SELECT}>
              <option value="">Tất cả</option>
              {Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {action && !(action in AUDIT_ACTION_LABEL) && <option value={action}>{action}</option>}
            </select>
          </div>
          <div>
            <label htmlFor="log-user" className="mb-1.5 block text-sm font-bold text-slate-900">
              Người thực hiện
            </label>
            <select id="log-user" value={userId ?? ""} onChange={(e) => setParam("user_id", e.target.value)} className={SELECT}>
              <option value="">Tất cả</option>
              {sortedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
              {userId !== undefined && !sortedUsers.some((u) => u.id === userId) && <option value={userId}>Người dùng #{userId}</option>}
            </select>
          </div>
          <div>
            <label htmlFor="log-from" className="mb-1.5 block text-sm font-bold text-slate-900">
              Từ ngày
            </label>
            <input id="log-from" type="date" value={fromDay} max={toDay || undefined} onChange={(e) => setParam("from", e.target.value)} aria-invalid={rangeError ? true : undefined} className={SELECT} />
          </div>
          <div>
            <label htmlFor="log-to" className="mb-1.5 block text-sm font-bold text-slate-900">
              Đến ngày
            </label>
            <input id="log-to" type="date" value={toDay} min={fromDay || undefined} onChange={(e) => setParam("to", e.target.value)} aria-invalid={rangeError ? true : undefined} className={SELECT} />
          </div>
        </div>
        {rangeError && (
          <div className="mt-4">
            <Notice type="error">{rangeError}</Notice>
          </div>
        )}
        {hasFilters && (
          <div className="mt-4">
            <Button variant="ghost" size="sm" className="-ml-4" onClick={() => setParams(new URLSearchParams())}>
              Xóa bộ lọc
            </Button>
          </div>
        )}
      </section>

      <div className="mt-6">
        {rangeError ? null : list.isError && !list.data ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              {getErrorMessage(list.error, "Không tải được nhật ký.")}
            </span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : list.isLoading ? (
          <div className="space-y-3" role="status" aria-label="Đang tải">
            <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <ClipboardList className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">{hasFilters ? "Không có bản ghi phù hợp" : "Chưa có bản ghi nào"}</p>
            {hasFilters && <p className="mt-1 text-sm text-slate-500">Hãy thử đổi hoặc xóa bớt bộ lọc.</p>}
          </div>
        ) : (
          <div className={`transition-opacity ${list.isFetching && !list.isFetchingNextPage ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <caption className="sr-only">Nhật ký thao tác</caption>
                <thead>
                  <tr className="border-b border-slate-100">
                    <th scope="col" className={th}>Thời gian</th>
                    <th scope="col" className={th}>Người thực hiện</th>
                    <th scope="col" className={th}>Hành động</th>
                    <th scope="col" className={th}>Chi tiết</th>
                    <th scope="col" className="w-14 px-4 py-3">
                      <span className="sr-only">Mở rộng</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <LogRow key={log.id} log={log} />
                  ))}
                </tbody>
              </table>
            </div>

            {list.isFetchNextPageError && (
              <div className="mt-4">
                <Notice type="error">Không tải thêm được nhật ký, vui lòng thử lại.</Notice>
              </div>
            )}
            {list.hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" disabled={list.isFetchingNextPage} leftIcon={list.isFetchingNextPage ? <Loader2 className="animate-spin" /> : undefined} onClick={() => void list.fetchNextPage()}>
                  Tải thêm
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
