import { lazy, Suspense, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, CircleAlert, CircleCheck, Sparkles, Target, TrendingUp, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import StatCard from "../../components/ui/StatCard";
import { approveTeacher } from "../../api/admin";
import { getErrorMessage } from "../../api/client";
import { formatNumber, formatPercent, formatUpdatedAt } from "../../utils/format";
import { ADMIN_USERS_KEY, PENDING_TEACHERS_KEY, useAdminOverview } from "./useAdminData";
import PendingTeachersCard from "./PendingTeachersCard";
import type { AdminUser, OverviewRange } from "../../types/admin";

// Recharts khá nặng: tải riêng khi vào trang Tổng quan
const ActivityChart = lazy(() => import("./ActivityChart"));
const AiUsageCard = lazy(() => import("./AiUsageCard"));

function ChartSkeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải biểu đồ" />;
}

const RANGES: { value: OverviewRange; label: string; days: number }[] = [
  { value: "7d", label: "7 ngày gần đây", days: 7 },
  { value: "30d", label: "30 ngày gần đây", days: 30 },
];

export default function OverviewPage() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<OverviewRange>("7d");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const o = useAdminOverview(range);

  const approve = useMutation({
    mutationFn: (teacher: AdminUser) => approveTeacher(teacher.id),
    onSuccess: (_data, teacher) => {
      setNotice({ type: "success", text: `Đã duyệt giáo viên ${teacher.name}.` });
      queryClient.invalidateQueries({ queryKey: PENDING_TEACHERS_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_USERS_KEY });
    },
    onError: (err) => setNotice({ type: "error", text: getErrorMessage(err) }),
  });

  // Thông báo thành công tự ẩn sau vài giây
  useEffect(() => {
    if (notice?.type !== "success") return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const days = RANGES.find((r) => r.value === range)?.days ?? 7;
  const aiPercent = o.mock.aiUsage.limit > 0 ? Math.round((o.mock.aiUsage.used / o.mock.aiUsage.limit) * 100) : 0;
  const approvingId = approve.isPending ? (approve.variables?.id ?? null) : null;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Tổng quan hệ thống</h1>
          <p className="mt-2 text-slate-500">
            {o.updatedAt > 0 ? `Dữ liệu vận hành cập nhật lúc ${formatUpdatedAt(o.updatedAt)}.` : "Đang tải dữ liệu vận hành..."}
          </p>
        </div>
        <div className="relative">
          <label htmlFor="overview-range" className="sr-only">
            Khoảng thời gian
          </label>
          <select
            id="overview-range"
            value={range}
            onChange={(e) => setRange(e.target.value as OverviewRange)}
            className="h-12 appearance-none rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-sm font-semibold text-slate-700 outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/20"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        </div>
      </div>

      {notice && (
        <div
          role={notice.type === "error" ? "alert" : "status"}
          className={`mt-6 flex items-center gap-2 rounded-2xl border p-4 text-sm font-semibold ${
            notice.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.type === "success" ? <CircleCheck className="size-5 shrink-0" aria-hidden="true" /> : <CircleAlert className="size-5 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}

      {o.isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được dữ liệu tài khoản từ máy chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => o.refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          tint="bg-brand-light text-brand"
          label="Tổng người dùng"
          value={formatNumber(o.stats.totalUsers)}
          sub={`+${formatNumber(o.stats.newUsers30d)} mới trong 30 ngày`}
          subClass="text-green-600"
          loading={o.isLoading}
        />
        <StatCard
          icon={TrendingUp}
          tint="bg-green-50 text-green-600"
          label="Người dùng hoạt động"
          value={formatNumber(o.stats.activeUsers)}
          sub={`${formatPercent(o.stats.activePercent)} tổng người dùng`}
          subClass="text-green-600"
          loading={o.isLoading}
        />
        {/* TODO: số liệu giả, nối API thống kê AI */}
        <StatCard icon={Sparkles} tint="bg-secondary/10 text-teal-600" label="Lượt gọi AI hôm nay" value={formatNumber(o.mock.aiCallsToday)} sub={`${aiPercent}% hạn mức ngày`} subClass="text-green-600" />
        {/* TODO: số liệu giả, nối API báo lỗi */}
        <StatCard icon={Target} tint="bg-red-50 text-red-500" label="Báo lỗi đang mở" value={formatNumber(o.mock.openReports)} sub={`${o.mock.highPriorityReports} lỗi ưu tiên cao`} subClass="text-red-600" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<ChartSkeleton className="h-[26rem]" />}>
            <ActivityChart data={o.mock.activity} days={days} />
          </Suspense>
        </div>
        <Suspense fallback={<ChartSkeleton className="h-[26rem]" />}>
          <AiUsageCard usage={o.mock.aiUsage} />
        </Suspense>
      </div>

      <div className="mt-6">
        <PendingTeachersCard teachers={o.pendingTeachers} loading={o.isLoading} approvingId={approvingId} onApprove={(t) => approve.mutate(t)} />
      </div>
    </div>
  );
}
