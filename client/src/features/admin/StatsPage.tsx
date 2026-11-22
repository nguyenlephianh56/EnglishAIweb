import { lazy, Suspense } from "react";
import { CircleAlert, Info } from "lucide-react";
import Button from "../../components/ui/Button";
import { EXERCISE_STATUS_LABEL, ROLE_LABEL } from "./adminMeta";
import { ExerciseStatusCards, UserRoleCards, UserStatusCards } from "./AdminSummary";
import { EXERCISE_STATUSES, useAdminUsers, useExerciseStatusCounts } from "./useAdminData";
import type { Role } from "../../types/auth";

// Recharts khá nặng: tải riêng khi vào trang Thống kê
const AdminBarChart = lazy(() => import("./AdminBarChart"));

const ChartSkeleton = () => <div className="h-80 animate-pulse rounded-3xl bg-slate-200" role="status" aria-label="Đang tải biểu đồ" />;

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-3 mt-8 font-heading text-lg font-bold text-slate-900">{children}</h2>;
}

/** /admin/stats: số liệu THẬT về tài khoản và bài tập (chưa có thống kê hoạt động, lượt dùng AI vì backend chưa hỗ trợ). */
export default function StatsPage() {
  const users = useAdminUsers();
  const exercises = useExerciseStatusCounts();
  const list = users.data ?? [];

  const roleData = (["STUDENT", "TEACHER", "ADMIN"] as Role[]).map((r) => ({ label: ROLE_LABEL[r], value: list.filter((u) => u.role === r).length }));
  const exerciseData = EXERCISE_STATUSES.map((s) => ({ label: EXERCISE_STATUS_LABEL[s], value: exercises.counts[s] ?? 0 }));
  const chartsReady = !users.isLoading && !users.isError && !exercises.isLoading && !exercises.isError;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Thống kê</h1>
      <p className="mt-2 text-slate-500">Số lượng tài khoản và bài tập hiện có trong hệ thống.</p>

      {(users.isError || exercises.isError) && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được một phần dữ liệu từ máy chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => Promise.all([users.refetch(), exercises.refetch()])}>
            Thử lại
          </Button>
        </div>
      )}

      <SectionTitle>Tài khoản theo vai trò</SectionTitle>
      <UserRoleCards users={list} loading={users.isLoading} />

      <SectionTitle>Tài khoản theo trạng thái</SectionTitle>
      <UserStatusCards users={list} loading={users.isLoading} />

      <SectionTitle>Bài tập theo trạng thái</SectionTitle>
      <ExerciseStatusCards counts={exercises.counts} loading={exercises.isLoading} />

      {chartsReady && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Suspense fallback={<ChartSkeleton />}>
            <AdminBarChart id="h-chart-roles" title="Tài khoản theo vai trò" subtitle="Số tài khoản của từng vai trò" data={roleData} color="var(--color-brand)" />
          </Suspense>
          <Suspense fallback={<ChartSkeleton />}>
            <AdminBarChart id="h-chart-exercises" title="Bài tập theo trạng thái" subtitle="Số bài tập ở từng trạng thái" data={exerciseData} color="var(--color-secondary)" />
          </Suspense>
        </div>
      )}

      <p className="mt-8 flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Thống kê hoạt động và lượt dùng AI sẽ có khi backend hỗ trợ.
      </p>
    </div>
  );
}
