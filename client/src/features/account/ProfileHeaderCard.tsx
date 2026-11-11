import { initials } from "../../components/layout/AppLayout";
import { formatDate } from "../../utils/format";
import type { AuthUser, Role, UserStatus } from "../../types/auth";

const ROLE_LABEL: Record<Role, string> = { STUDENT: "Học sinh", TEACHER: "Giáo viên", ADMIN: "Quản trị" };
export const roleLabel = (role: Role) => ROLE_LABEL[role];

const STATUS: Record<UserStatus, { label: string; tone: string }> = {
  ACTIVE: { label: "Hoạt động", tone: "bg-green-50 text-green-700" },
  PENDING: { label: "Chờ duyệt", tone: "bg-amber-50 text-amber-700" },
  LOCKED: { label: "Đã khóa", tone: "bg-red-50 text-red-700" },
};

export default function ProfileHeaderCard({ user }: { user: AuthUser }) {
  const joined = new Date(user.createdAt);
  const status = STATUS[user.status];

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm" aria-label="Thông tin tài khoản">
      <div className="h-24 bg-linear-to-br from-brand-dark via-brand to-indigo-500" aria-hidden="true" />
      <div className="flex flex-col items-center gap-5 px-6 pb-8 text-center sm:flex-row sm:items-end sm:text-left">
        <span
          className="-mt-12 grid size-24 shrink-0 place-items-center rounded-full bg-linear-to-br from-indigo-200 to-violet-300 font-heading text-3xl font-extrabold text-brand-dark ring-4 ring-white"
          aria-hidden="true"
        >
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-heading text-2xl font-extrabold tracking-tight text-slate-900">{user.name}</h2>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="rounded-full bg-brand-light px-3 py-1.5 text-xs font-bold text-brand">{ROLE_LABEL[user.role]}</span>
            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${status.tone}`}>{status.label}</span>
            {!Number.isNaN(joined.getTime()) && <span className="text-xs text-slate-500">Tham gia từ {formatDate(joined)}</span>}
          </p>
        </div>
      </div>
    </section>
  );
}
