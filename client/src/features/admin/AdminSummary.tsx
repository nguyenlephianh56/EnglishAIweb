import { Link } from "react-router-dom";
import { Clock, EyeOff, FileText, GraduationCap, Library, Lock, Send, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import StatCard from "../../components/ui/StatCard";
import { formatNumber } from "../../utils/format";
import { EXERCISE_STATUS_LABEL, ROLE_LABEL, STATUS_LABEL } from "./adminMeta";
import type { AdminUser } from "../../types/admin";
import type { Role, UserStatus } from "../../types/auth";
import type { ExerciseStatus } from "../../types/exercise";

const GRID = "grid gap-5 sm:grid-cols-2 xl:grid-cols-4";

/** Thẻ số liệu bấm được: dẫn tới trang liên quan */
function LinkCard({ to, ...props }: { to: string } & Parameters<typeof StatCard>[0]) {
  return (
    <Link to={to} className="block rounded-3xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
      <StatCard {...props} />
    </Link>
  );
}

const ROLE_ICON: Record<Role, { icon: LucideIcon; tint: string }> = {
  STUDENT: { icon: Users, tint: "bg-sky-50 text-sky-600" },
  TEACHER: { icon: GraduationCap, tint: "bg-secondary/10 text-teal-600" },
  ADMIN: { icon: ShieldCheck, tint: "bg-violet-50 text-violet-600" },
};
const STATUS_ICON: Record<UserStatus, { icon: LucideIcon; tint: string }> = {
  ACTIVE: { icon: UserCheck, tint: "bg-green-50 text-green-600" },
  PENDING: { icon: Clock, tint: "bg-amber-50 text-amber-600" },
  LOCKED: { icon: Lock, tint: "bg-red-50 text-red-500" },
};
const EXERCISE_ICON: Record<ExerciseStatus, { icon: LucideIcon; tint: string; to: string }> = {
  DRAFT: { icon: FileText, tint: "bg-slate-100 text-slate-600", to: "/admin/library?status=DRAFT" },
  PROPOSED: { icon: Send, tint: "bg-amber-50 text-amber-600", to: "/admin/proposals" },
  PUBLISHED: { icon: Library, tint: "bg-green-50 text-green-600", to: "/admin/library?status=PUBLISHED" },
  HIDDEN: { icon: EyeOff, tint: "bg-slate-100 text-slate-500", to: "/admin/library?status=HIDDEN" },
};

const countOf = (users: AdminUser[], pick: (u: AdminUser) => boolean) => users.filter(pick).length;

/** Tổng số tài khoản và số tài khoản theo trạng thái (đếm từ GET /admin/users) */
export function UserStatusCards({ users, loading }: { users: AdminUser[]; loading: boolean }) {
  return (
    <div className={GRID}>
      <LinkCard to="/admin/users" icon={Users} tint="bg-brand-light text-brand" label="Tổng tài khoản" value={formatNumber(users.length)} sub="Xem danh sách" subClass="text-brand" loading={loading} />
      {(["ACTIVE", "PENDING", "LOCKED"] as UserStatus[]).map((s) => (
        <LinkCard
          key={s}
          to={`/admin/users?status=${s}`}
          icon={STATUS_ICON[s].icon}
          tint={STATUS_ICON[s].tint}
          label={`Tài khoản ${STATUS_LABEL[s].toLowerCase()}`}
          value={formatNumber(countOf(users, (u) => u.status === s))}
          sub="Xem danh sách"
          subClass="text-brand"
          loading={loading}
        />
      ))}
    </div>
  );
}

/** Số tài khoản theo vai trò */
export function UserRoleCards({ users, loading }: { users: AdminUser[]; loading: boolean }) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {(["STUDENT", "TEACHER", "ADMIN"] as Role[]).map((r) => (
        <LinkCard
          key={r}
          to={`/admin/users?role=${r}`}
          icon={ROLE_ICON[r].icon}
          tint={ROLE_ICON[r].tint}
          label={ROLE_LABEL[r]}
          value={formatNumber(countOf(users, (u) => u.role === r))}
          sub="Xem danh sách"
          subClass="text-brand"
          loading={loading}
        />
      ))}
    </div>
  );
}

/** Số bài tập theo trạng thái (đọc total của GET /exercises?status=X&pageSize=1) */
export function ExerciseStatusCards({ counts, loading }: { counts: Record<ExerciseStatus, number | undefined>; loading: boolean }) {
  return (
    <div className={GRID}>
      {(Object.keys(EXERCISE_ICON) as ExerciseStatus[]).map((s) => (
        <LinkCard
          key={s}
          to={EXERCISE_ICON[s].to}
          icon={EXERCISE_ICON[s].icon}
          tint={EXERCISE_ICON[s].tint}
          label={`Bài tập: ${EXERCISE_STATUS_LABEL[s].toLowerCase()}`}
          value={counts[s] === undefined ? "—" : formatNumber(counts[s] as number)}
          sub="Xem chi tiết"
          subClass="text-brand"
          loading={loading}
        />
      ))}
    </div>
  );
}
