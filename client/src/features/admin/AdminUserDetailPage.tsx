import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, BookOpen, CircleAlert, Clock, FileCheck, GraduationCap, Lock, LockOpen, Pencil, School, ShieldCheck, ShieldOff, Sparkles, Trash2, UserCheck } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import StatCard from "../../components/ui/StatCard";
import Notice from "../account/Notice";
import { UserAvatar } from "../../components/layout/AppLayout";
import { getErrorCode, getErrorMessage } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { formatDate, formatNumber, formatTime } from "../../utils/format";
import { ROLE_BADGE, ROLE_LABEL, STATUS_BADGE, STATUS_LABEL, formatRelative, isAnonymizedEmail } from "./adminMeta";
import { useAdminUserDetail, useUserActions } from "./useAdminData";
import { userOpErrorMessage, useAdminUserOps } from "./useAdminUserOps";
import type { AdminUserDetail, UpdateUserBody } from "../../types/admin";

type ModalKind = "edit" | "lock" | "promote" | "revoke" | "delete";

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SELECT = "h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base sm:text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải" />;
}

const fullDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${formatTime(d)}, ${formatDate(d)}`;
};

/** Hộp thoại sửa tên/email: chỉ gửi field thay đổi, nút Lưu khóa khi không đổi hoặc không hợp lệ */
function EditForm({ user, pending, error, onSubmit, onCancel }: { user: AdminUserDetail; pending: boolean; error: string | null; onSubmit: (body: UpdateUserBody) => void; onCancel: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameError = trimmedName.length < 2 || trimmedName.length > 100 ? "Họ tên từ 2 đến 100 ký tự" : CONTROL_CHARS.test(trimmedName) ? "Họ tên không được chứa ký tự điều khiển" : undefined;
  const emailError = trimmedEmail.length > 255 ? "Email tối đa 255 ký tự" : !EMAIL_RE.test(trimmedEmail) ? "Email không hợp lệ" : undefined;
  const nameChanged = trimmedName !== user.name;
  const emailChanged = trimmedEmail.toLowerCase() !== user.email.toLowerCase();
  const canSave = !nameError && !emailError && (nameChanged || emailChanged) && !pending;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const body: UpdateUserBody = {};
    if (nameChanged) body.name = trimmedName;
    if (emailChanged) body.email = trimmedEmail;
    onSubmit(body);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-4">
      <Input label="Họ tên" value={name} onChange={(e) => setName(e.target.value)} error={nameError} autoComplete="off" />
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} autoComplete="off" />
      {error && <Notice type="error">{error}</Notice>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="submit" loading={pending} disabled={!canSave}>
          Lưu
        </Button>
      </div>
    </form>
  );
}

/** Hộp thoại thu hồi quyền quản trị: chọn vai trò mới */
function RevokeForm({ pending, error, onSubmit, onCancel }: { pending: boolean; error: string | null; onSubmit: (role: "TEACHER" | "STUDENT") => void; onCancel: () => void }) {
  const [role, setRole] = useState<"TEACHER" | "STUDENT">("TEACHER");
  return (
    <div className="mt-4 space-y-4">
      <div>
        <label htmlFor="revoke-role" className="mb-1.5 block text-sm font-bold text-slate-900">
          Hạ xuống vai trò
        </label>
        <select id="revoke-role" value={role} onChange={(e) => setRole(e.target.value as "TEACHER" | "STUDENT")} className={SELECT}>
          <option value="TEACHER">Giáo viên</option>
          <option value="STUDENT">Học sinh</option>
        </select>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Phải còn ít nhất một quản trị viên đang hoạt động trong hệ thống.</li>
        <li>Tài khoản đang là chủ của lớp học không thể hạ xuống Học sinh.</li>
      </ul>
      {error && <Notice type="error">{error}</Notice>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="button" variant="danger" loading={pending} onClick={() => onSubmit(role)}>
          Thu hồi quyền
        </Button>
      </div>
    </div>
  );
}

/** Hộp thoại xóa tài khoản: phải gõ đúng email mới bấm được */
function DeleteForm({ user, pending, error, onSubmit, onCancel }: { user: AdminUserDetail; pending: boolean; error: string | null; onSubmit: () => void; onCancel: () => void }) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase();
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-slate-600">
        Tài khoản chưa có dữ liệu liên quan sẽ bị <strong>xóa vĩnh viễn</strong>. Nếu đã có dữ liệu (lớp, bài nộp, bài tạo...), tài khoản sẽ được <strong>ẩn danh và khóa</strong>: tên và email được thay bằng giá trị tạm, lịch sử vẫn được giữ lại.
      </p>
      <Input label={`Nhập email ${user.email} để xác nhận`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      {error && <Notice type="error">{error}</Notice>}
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
        <Button type="button" variant="danger" leftIcon={<Trash2 />} loading={pending} disabled={!matches || pending} onClick={onSubmit}>
          Xóa tài khoản
        </Button>
      </div>
    </div>
  );
}

/** /admin/users/:id: thông tin, số liệu và các thao tác quản trị một tài khoản. */
export default function AdminUserDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { user: me } = useAuth();
  const q = useAdminUserDetail(id);
  const user = q.data;
  const actions = useUserActions();
  const [modal, setModal] = useState<ModalKind | null>(null);

  const notFound = !Number.isInteger(id) || id <= 0 || (q.isError && (getErrorCode(q.error) === "USER_NOT_FOUND" || (axios.isAxiosError(q.error) && q.error.response?.status === 404)));

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <Link to="/admin/users" className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Tài khoản
      </Link>

      {notFound ? (
        <div role="alert" className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-heading text-lg font-bold text-slate-900">Không tìm thấy tài khoản</p>
          <p className="mt-1 text-sm text-slate-500">Tài khoản không tồn tại hoặc đã bị xóa.</p>
          <div className="mt-5">
            <Button to="/admin/users" variant="outline">
              Về danh sách tài khoản
            </Button>
          </div>
        </div>
      ) : q.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            {getErrorMessage(q.error, "Không tải được thông tin tài khoản.")}
          </span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : q.isLoading || !user ? (
        <div className="mt-6 space-y-6">
          <Skeleton className="h-40" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : (
        <Detail user={user} selfId={me?.id} actions={actions} modal={modal} setModal={setModal} />
      )}
    </div>
  );
}

function Detail({ user, selfId, actions, modal, setModal }: { user: AdminUserDetail; selfId: number | undefined; actions: ReturnType<typeof useUserActions>; modal: ModalKind | null; setModal: (m: ModalKind | null) => void }) {
  const ops = useAdminUserOps(user);
  const isSelf = user.id === selfId;
  const anonymized = isAnonymizedEmail(user.email);
  const { stats } = user;
  const close = () => setModal(null);
  const busy = actions.pending || ops.edit.isPending || ops.promote.isPending || ops.revoke.isPending || ops.remove.isPending;

  const lockReason = isSelf ? "Không thể khóa chính mình" : user.role === "ADMIN" ? "Không thể khóa quản trị viên" : null;
  const open = (m: ModalKind) => {
    ops.edit.reset();
    ops.promote.reset();
    ops.revoke.reset();
    ops.remove.reset();
    setModal(m);
  };

  return (
    <>
      <section className="mt-6 flex flex-wrap items-center gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Thông tin tài khoản">
        <UserAvatar name={user.name} />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
            {user.name}
            {isSelf && <span className="ml-2 text-sm font-semibold text-slate-400">(bạn)</span>}
          </h1>
          <p className="mt-1 break-all text-slate-500">{user.email}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${ROLE_BADGE[user.role]}`}>{ROLE_LABEL[user.role]}</span>
            <span className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${STATUS_BADGE[user.status]}`}>{STATUS_LABEL[user.status]}</span>
            <span>Tạo ngày {formatDate(new Date(user.createdAt))}</span>
          </p>
        </div>
      </section>

      <div className="mt-4 space-y-3">
        {anonymized && <Notice type="warning">Tài khoản đã được ẩn danh</Notice>}
        {actions.notice && <Notice type={actions.notice.type}>{actions.notice.text}</Notice>}
        {ops.notice && <Notice type={ops.notice.type}>{ops.notice.text}</Notice>}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {user.role === "TEACHER" && <StatCard icon={School} tint="bg-brand-light text-brand" label="Lớp đang dạy" value={formatNumber(stats.classesTeaching)} sub="Lớp do tài khoản phụ trách" subClass="text-slate-500" />}
        {user.role === "STUDENT" && <StatCard icon={GraduationCap} tint="bg-brand-light text-brand" label="Lớp đã tham gia" value={formatNumber(stats.classesJoined)} sub="Lớp học đang học" subClass="text-slate-500" />}
        {user.role === "STUDENT" && <StatCard icon={FileCheck} tint="bg-green-50 text-green-600" label="Bài đã nộp" value={formatNumber(stats.attemptsCount)} sub="Tổng số lần nộp bài" subClass="text-slate-500" />}
        {user.role !== "STUDENT" && <StatCard icon={BookOpen} tint="bg-green-50 text-green-600" label="Bài đã tạo" value={formatNumber(stats.exercisesCreated)} sub="Bài tập do tài khoản tạo" subClass="text-slate-500" />}
        <StatCard
          icon={Sparkles}
          tint="bg-violet-50 text-violet-600"
          label="Lượt AI hôm nay / tổng"
          value={`${formatNumber(stats.aiRequests.today)} / ${formatNumber(stats.aiRequests.total)}`}
          sub="Số lượt gọi AI"
          subClass="text-slate-500"
        />
        <StatCard
          icon={Clock}
          tint="bg-amber-50 text-amber-600"
          label="Hoạt động gần nhất"
          value={stats.lastActivityAt ? formatRelative(stats.lastActivityAt) : "Chưa có"}
          sub={stats.lastActivityAt ? fullDateTime(stats.lastActivityAt) : "Chưa ghi nhận hoạt động"}
          subClass="text-slate-500"
        />
      </div>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="h-user-actions">
        <h2 id="h-user-actions" className="font-heading text-lg font-bold text-slate-900">
          Thao tác
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" leftIcon={<Pencil />} disabled={busy || anonymized} onClick={() => open("edit")}>
            Sửa thông tin
          </Button>
          {user.status === "PENDING" && user.role === "TEACHER" && (
            <Button variant="secondary" leftIcon={<UserCheck />} loading={actions.pending} disabled={busy} onClick={() => actions.run("approve", user)}>
              Duyệt giáo viên
            </Button>
          )}
          {user.status === "ACTIVE" && (
            <span title={lockReason ?? undefined}>
              <Button variant="outline" leftIcon={<Lock />} disabled={busy || lockReason !== null} onClick={() => open("lock")}>
                Khóa
              </Button>
            </span>
          )}
          {user.status === "LOCKED" && (
            <Button variant="outline" leftIcon={<LockOpen />} loading={actions.pending} disabled={busy || anonymized} onClick={() => actions.run("unlock", user)}>
              Mở khóa
            </Button>
          )}
          {user.role !== "ADMIN" && user.status === "ACTIVE" && (
            <Button variant="outline" leftIcon={<ShieldCheck />} disabled={busy || anonymized} onClick={() => open("promote")}>
              Bổ nhiệm quản trị viên
            </Button>
          )}
          {user.role === "ADMIN" && !isSelf && (
            <Button variant="outline" leftIcon={<ShieldOff />} disabled={busy} onClick={() => open("revoke")}>
              Thu hồi quyền quản trị
            </Button>
          )}
          {!isSelf && (
            <Button variant="danger" leftIcon={<Trash2 />} disabled={busy || anonymized} onClick={() => open("delete")}>
              Xóa tài khoản
            </Button>
          )}
        </div>
        {isSelf && <p className="mt-3 text-xs text-slate-500">Đây là tài khoản của bạn nên không thể khóa, thu hồi quyền hoặc xóa.</p>}
      </section>

      <Modal open={modal === "edit"} onClose={close} title="Sửa thông tin" description="Chỉ những trường thay đổi mới được gửi lên máy chủ.">
        {modal === "edit" && (
          <EditForm
            user={user}
            pending={ops.edit.isPending}
            error={ops.edit.isError ? userOpErrorMessage(ops.edit.error, "Không lưu được thông tin, vui lòng thử lại.") : null}
            onSubmit={(body) => ops.edit.mutate(body, { onSuccess: close })}
            onCancel={close}
          />
        )}
      </Modal>

      <Modal open={modal === "lock"} onClose={close} title="Khóa tài khoản?" description={`${user.name} (${user.email}) sẽ không thể đăng nhập cho đến khi được mở khóa.`}>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={close}>
            Hủy
          </Button>
          <Button
            variant="danger"
            leftIcon={<Lock />}
            onClick={() => {
              actions.run("lock", user);
              close();
            }}
          >
            Khóa tài khoản
          </Button>
        </div>
      </Modal>

      <Modal open={modal === "promote"} onClose={close} title="Bổ nhiệm quản trị viên?" description={`${user.name} sẽ có toàn quyền trên hệ thống: quản lý tài khoản, thư viện bài tập, cấu hình AI và nhật ký.`}>
        <div className="mt-4 space-y-4">
          {ops.promote.isError && <Notice type="error">{userOpErrorMessage(ops.promote.error)}</Notice>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={close}>
              Hủy
            </Button>
            <Button leftIcon={<ShieldCheck />} loading={ops.promote.isPending} onClick={() => ops.promote.mutate(undefined, { onSuccess: close })}>
              Bổ nhiệm
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "revoke"} onClose={close} title="Thu hồi quyền quản trị?" description={`${user.name} sẽ không còn là quản trị viên.`}>
        {modal === "revoke" && (
          <RevokeForm pending={ops.revoke.isPending} error={ops.revoke.isError ? userOpErrorMessage(ops.revoke.error) : null} onSubmit={(role) => ops.revoke.mutate(role, { onSuccess: close })} onCancel={close} />
        )}
      </Modal>

      <Modal open={modal === "delete"} onClose={close} title="Xóa tài khoản?" description={`${user.name} (${user.email})`}>
        {modal === "delete" && <DeleteForm user={user} pending={ops.remove.isPending} error={ops.remove.isError ? userOpErrorMessage(ops.remove.error) : null} onSubmit={() => ops.remove.mutate(undefined, { onSuccess: close })} onCancel={close} />}
      </Modal>
    </>
  );
}
