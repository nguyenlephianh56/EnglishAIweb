import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CircleAlert, Copy, School, ShieldCheck, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import JoinClassModal from "../student/JoinClassModal";
import { HOME_KEY } from "../student/useHomeData";
import { useTeacherClasses } from "../teacher/useTeacherData";
import { STUDENT_CLASSES_KEY, useStudentClasses } from "./useAccountClasses";
import Notice from "./Notice";
import { formatNumber } from "../../utils/format";
import type { Role } from "../../types/auth";
import type { JoinedClass } from "../../types/student";

const CARD = "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8";

function ListSkeleton() {
  return (
    <div className="mt-5 space-y-3" role="status" aria-label="Đang tải">
      {[0, 1].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
      ))}
    </div>
  );
}

function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
        Không tải được danh sách lớp.
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
        <School className="size-5" />
      </span>
      <p className="mt-3 font-heading font-bold text-slate-900">{text}</p>
    </div>
  );
}

function StudentSection() {
  const queryClient = useQueryClient();
  const classes = useStudentClasses();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  function handleJoined(joined: JoinedClass) {
    setJoinOpen(false);
    setJoinedName(joined.name);
    queryClient.invalidateQueries({ queryKey: STUDENT_CLASSES_KEY }); // làm mới danh sách lớp
    queryClient.invalidateQueries({ queryKey: HOME_KEY });
  }

  return (
    <section className={CARD} aria-labelledby="h-role-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-role-section" className="font-heading text-xl font-bold text-slate-900">
            Lớp đã tham gia
          </h2>
          <p className="mt-1 text-sm text-slate-500">Các lớp học bạn đang theo học.</p>
        </div>
        <Button variant="outline" size="sm" rightIcon={<Users />} onClick={() => setJoinOpen(true)}>
          Tham gia lớp
        </Button>
      </div>

      {joinedName && (
        <div className="mt-4">
          <Notice type="success">{`Bạn đã tham gia lớp “${joinedName}” thành công.`}</Notice>
        </div>
      )}

      {classes.isLoading ? (
        <ListSkeleton />
      ) : classes.isError ? (
        <ListError onRetry={() => classes.refetch()} />
      ) : (classes.data ?? []).length === 0 ? (
        <EmptyState text="Bạn chưa tham gia lớp nào" />
      ) : (
        <ul className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {classes.data!.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900">{c.name}</p>
                {c.teacher && <p className="text-sm text-slate-500">Giáo viên: {c.teacher.name}</p>}
              </div>
              {typeof c.studentCount === "number" && <span className="text-sm font-semibold text-slate-600">{formatNumber(c.studentCount)} học sinh</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Button to="/student/profile" variant="ghost" size="sm" className="-ml-4" rightIcon={<ArrowRight />}>
          Xem hồ sơ kỹ năng
        </Button>
      </div>

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
    </section>
  );
}

function TeacherSection() {
  const classes = useTeacherClasses();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copyCode(id: number, code: string) {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setCopyFailed(false);
      setCopiedId(id);
      timer.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
      setCopyFailed(true); // trình duyệt chặn clipboard (ví dụ trang không dùng HTTPS)
    }
  }

  return (
    <section className={CARD} aria-labelledby="h-role-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="h-role-section" className="font-heading text-xl font-bold text-slate-900">
            Lớp đang dạy
          </h2>
          <p className="mt-1 text-sm text-slate-500">Chia sẻ mã lớp để học sinh tham gia.</p>
        </div>
        <Button to="/teacher/classes" variant="ghost" size="sm" rightIcon={<ArrowRight />}>
          Quản lý lớp
        </Button>
      </div>

      {copyFailed && (
        <div className="mt-4">
          <Notice type="error">Không sao chép được. Hãy chọn mã lớp và sao chép thủ công.</Notice>
        </div>
      )}

      {classes.isLoading ? (
        <ListSkeleton />
      ) : classes.isError ? (
        <ListError onRetry={() => classes.refetch()} />
      ) : (classes.data ?? []).length === 0 ? (
        <EmptyState text="Chưa có lớp nào" />
      ) : (
        <ul className="mt-5 divide-y divide-slate-100 rounded-2xl border border-slate-100">
          {classes.data!.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900">{c.name}</p>
                <p className="mt-0.5 text-sm text-slate-500">{formatNumber(c.studentCount)} học sinh</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-brand-light px-3 py-1.5 font-heading text-sm font-bold tracking-widest text-brand" aria-label={`Mã lớp ${c.code}`}>
                  {c.code}
                </span>
                <Button variant="outline" size="sm" leftIcon={copiedId === c.id ? <Check /> : <Copy />} onClick={() => copyCode(c.id, c.code)}>
                  {copiedId === c.id ? "Đã sao chép" : "Sao chép"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" role="status">
        {copiedId !== null ? "Đã sao chép mã lớp" : ""}
      </p>
    </section>
  );
}

function AdminSection() {
  return (
    <section className={CARD} aria-labelledby="h-role-section">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-light text-brand" aria-hidden="true">
          <ShieldCheck className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="h-role-section" className="font-heading text-xl font-bold text-slate-900">
            Quản trị hệ thống
          </h2>
          <p className="mt-1 text-sm text-slate-500">Bạn có quyền duyệt giáo viên, quản lý tài khoản và thư viện bài tập của toàn hệ thống.</p>
          <div className="mt-3">
            <Button to="/admin/users" variant="ghost" size="sm" className="-ml-4" rightIcon={<ArrowRight />}>
              Quản lý tài khoản
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Khối riêng theo vai trò, đặt dưới các tab */
export default function RoleSection({ role }: { role: Role }) {
  if (role === "STUDENT") return <StudentSection />;
  if (role === "TEACHER") return <TeacherSection />;
  return <AdminSection />;
}
