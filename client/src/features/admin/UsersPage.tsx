import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CircleAlert, Eye, Lock, LockOpen, Search, UserCheck, UserX } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { UserAvatar } from "../../components/layout/AppLayout";
import { formatDate, formatNumber } from "../../utils/format";
import { ROLES, ROLE_BADGE, ROLE_LABEL, STATUS_BADGE, STATUS_LABEL, USER_STATUSES, isRole, isUserStatus, normalizeText } from "./adminMeta";
import { useAdminUsers, useUserActions } from "./useAdminData";
import type { AdminUser } from "../../types/admin";
import type { Role, UserStatus } from "../../types/auth";

const PAGE_SIZE = 20;
const TH = "px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400";

type StatusFilter = UserStatus | "all";

/** Nút thao tác theo trạng thái; thao tác không thể làm (chính mình, quản trị viên) bị khóa kèm lý do. */
function RowActions({ user, selfId, busyId, onApprove, onLock, onUnlock }: { user: AdminUser; selfId: number | undefined; busyId: number | null; onApprove: () => void; onLock: () => void; onUnlock: () => void }) {
  const busy = busyId === user.id;
  const other = busyId !== null && !busy;
  if (user.status === "PENDING" && user.role === "TEACHER") {
    return (
      <Button variant="secondary" size="sm" leftIcon={<UserCheck />} loading={busy} disabled={other} onClick={onApprove}>
        Duyệt
      </Button>
    );
  }
  if (user.status === "ACTIVE") {
    const reason = user.id === selfId ? "Không thể khóa chính mình" : user.role === "ADMIN" ? "Không thể khóa quản trị viên" : null;
    return (
      <span title={reason ?? undefined}>
        <Button variant="outline" size="sm" leftIcon={<Lock />} loading={busy} disabled={other || reason !== null} onClick={onLock}>
          Khóa
        </Button>
      </span>
    );
  }
  if (user.status === "LOCKED") {
    return (
      <Button variant="outline" size="sm" leftIcon={<LockOpen />} loading={busy} disabled={other} onClick={onUnlock}>
        Mở khóa
      </Button>
    );
  }
  return <span className="text-slate-400">—</span>;
}

/** /admin/users: toàn bộ tài khoản, lọc theo vai trò/trạng thái, tìm theo tên hoặc email, duyệt/khóa/mở khóa. */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [search, setSearch] = useSearchParams();
  const users = useAdminUsers();
  const actions = useUserActions();
  // Thông báo từ trang chi tiết (ví dụ vừa xóa tài khoản)
  const flash = (useLocation().state as { notice?: string } | null)?.notice;

  const roleParam = search.get("role");
  const statusParam = search.get("status");
  const role: Role | "all" = isRole(roleParam) ? roleParam : "all";
  const status: StatusFilter = isUserStatus(statusParam) ? statusParam : "all";
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [locking, setLocking] = useState<AdminUser | null>(null);

  function setParam(key: "role" | "status", value: string) {
    const p = new URLSearchParams(search);
    if (value === "all") p.delete(key);
    else p.set(key, value);
    setSearch(p, { replace: true });
  }

  const all = useMemo(() => users.data ?? [], [users.data]);
  const q = normalizeText(query);

  // Lọc theo vai trò và từ khóa trước; số đếm của từng trạng thái tính trên kết quả đó
  const base = useMemo(() => all.filter((u) => (role === "all" || u.role === role) && (q === "" || normalizeText(u.name).includes(q) || normalizeText(u.email).includes(q))), [all, role, q]);
  const counts: Record<StatusFilter, number> = {
    all: base.length,
    PENDING: base.filter((u) => u.status === "PENDING").length,
    ACTIVE: base.filter((u) => u.status === "ACTIVE").length,
    LOCKED: base.filter((u) => u.status === "LOCKED").length,
  };
  const rows = status === "all" ? base : base.filter((u) => u.status === status);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  useEffect(() => setPage(1), [role, status, q]);

  const tabs: { id: StatusFilter; label: string }[] = [{ id: "all", label: "Tất cả" }, ...USER_STATUSES.map((s) => ({ id: s as StatusFilter, label: STATUS_LABEL[s] }))];

  function confirmLock() {
    if (!locking) return;
    actions.run("lock", locking);
    setLocking(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tài khoản</h1>
      <p className="mt-2 text-slate-500">Duyệt giáo viên mới, khóa hoặc mở khóa tài khoản người dùng.</p>

      {flash && (
        <div className="mt-6">
          <Notice type="success">{flash}</Notice>
        </div>
      )}
      {actions.notice && (
        <div className="mt-6">
          <Notice type={actions.notice.type}>{actions.notice.text}</Notice>
        </div>
      )}

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-label="Danh sách tài khoản">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-60 flex-1">
            <Input label="Tìm theo tên hoặc email" hideLabel leftIcon={<Search />} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên hoặc email" autoComplete="off" />
          </div>
          <div>
            <label htmlFor="users-role" className="sr-only">
              Vai trò
            </label>
            <select
              id="users-role"
              value={role}
              onChange={(e) => setParam("role", e.target.value)}
              className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
            >
              <option value="all">Mọi vai trò</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div role="group" aria-label="Lọc theo trạng thái" className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => {
            const selected = t.id === status;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setParam("status", t.id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                  selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {t.label}
                <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>{users.isLoading ? "…" : formatNumber(counts[t.id])}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {users.isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              <span className="flex items-center gap-2">
                <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
                {getErrorMessage(users.error, "Không tải được danh sách tài khoản.")}
              </span>
              <Button variant="outline" size="sm" onClick={() => users.refetch()}>
                Thử lại
              </Button>
            </div>
          ) : users.isLoading ? (
            <div className="space-y-3" role="status" aria-label="Đang tải">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                <UserX className="size-6" />
              </span>
              <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không có tài khoản nào</p>
              <p className="mt-1 text-sm text-slate-500">{all.length === 0 ? "Chưa có tài khoản nào trong hệ thống." : "Không có tài khoản khớp với bộ lọc hiện tại."}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <caption className="sr-only">Danh sách tài khoản</caption>
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className={TH}>Họ tên</th>
                      <th scope="col" className={TH}>Email</th>
                      <th scope="col" className={TH}>Vai trò</th>
                      <th scope="col" className={TH}>Trạng thái</th>
                      <th scope="col" className={TH}>Ngày tạo</th>
                      <th scope="col" className={TH}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-3">
                            <UserAvatar name={u.name} />
                            <span className="font-bold text-slate-900">
                              {u.name}
                              {u.id === me?.id && <span className="ml-2 text-xs font-semibold text-slate-400">(bạn)</span>}
                            </span>
                          </span>
                        </td>
                        <td className="max-w-60 truncate px-4 py-3 text-slate-600" title={u.email}>
                          {u.email}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${ROLE_BADGE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${STATUS_BADGE[u.status]}`}>{STATUS_LABEL[u.status]}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(new Date(u.createdAt))}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                          <Link
                            to={`/admin/users/${u.id}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-brand hover:bg-brand-light focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                          >
                            <Eye className="size-4" aria-hidden="true" />
                            Chi tiết<span className="sr-only"> của {u.name}</span>
                          </Link>
                          <RowActions user={u} selfId={me?.id} busyId={actions.busyId} onApprove={() => actions.run("approve", u)} onLock={() => setLocking(u)} onUnlock={() => actions.run("unlock", u)} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Hiện {formatNumber((current - 1) * PAGE_SIZE + 1)}–{formatNumber((current - 1) * PAGE_SIZE + visible.length)} / {formatNumber(rows.length)} tài khoản
              </p>
              <Pagination page={current} pageCount={pageCount} onChange={setPage} />
            </>
          )}
        </div>
      </section>

      <Modal open={locking !== null} onClose={() => setLocking(null)} title="Khóa tài khoản?" description={locking ? `${locking.name} (${locking.email}) sẽ không thể đăng nhập cho đến khi được mở khóa.` : undefined}>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setLocking(null)}>
            Hủy
          </Button>
          <Button variant="danger" leftIcon={<Lock />} onClick={confirmLock}>
            Khóa tài khoản
          </Button>
        </div>
      </Modal>
    </div>
  );
}
