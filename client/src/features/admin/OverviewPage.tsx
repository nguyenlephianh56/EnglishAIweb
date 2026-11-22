import { CircleAlert } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import { formatUpdatedAt } from "../../utils/format";
import { ExerciseStatusCards, UserStatusCards } from "./AdminSummary";
import PendingTeachersCard from "./PendingTeachersCard";
import { useAdminUsers, useExerciseStatusCounts, usePendingTeachers, useUserActions } from "./useAdminData";

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-slate-900">{children}</h2>;
}

/** /admin: số liệu THẬT (tài khoản theo trạng thái, bài tập theo trạng thái) và giáo viên chờ duyệt. */
export default function OverviewPage() {
  const users = useAdminUsers();
  const pending = usePendingTeachers();
  const exercises = useExerciseStatusCounts();
  const actions = useUserActions();

  const isError = users.isError || pending.isError || exercises.isError;
  const updatedAt = Math.max(users.dataUpdatedAt, pending.dataUpdatedAt);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tổng quan hệ thống</h1>
      <p className="mt-2 text-slate-500">{updatedAt > 0 ? `Dữ liệu cập nhật lúc ${formatUpdatedAt(updatedAt)}.` : "Đang tải dữ liệu..."}</p>

      {actions.notice && (
        <div className="mt-6">
          <Notice type={actions.notice.type}>{actions.notice.text}</Notice>
        </div>
      )}

      {isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được một phần dữ liệu từ máy chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => Promise.all([users.refetch(), pending.refetch(), exercises.refetch()])}>
            Thử lại
          </Button>
        </div>
      )}

      <SectionTitle>Tài khoản</SectionTitle>
      <UserStatusCards users={users.data ?? []} loading={users.isLoading} />

      <SectionTitle>Bài tập</SectionTitle>
      <ExerciseStatusCards counts={exercises.counts} loading={exercises.isLoading} />

      <div className="mt-8">
        <PendingTeachersCard teachers={pending.data ?? []} loading={pending.isLoading} approvingId={actions.busyId} onApprove={(t) => actions.run("approve", t)} />
      </div>
    </div>
  );
}
