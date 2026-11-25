import { lazy, Suspense, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CircleAlert, PenLine, School, Sparkles, TrendingUp, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import StatCard from "../../components/ui/StatCard";
import { useAuth } from "../../hooks/useAuth";
import { formatNumber, greetingByHour } from "../../utils/format";
import { useTeacherOverview } from "./useTeacherData";
import AttentionCard from "./AttentionCard";
import RecentAssignmentsCard from "./RecentAssignmentsCard";

// Recharts khá nặng: tải riêng khi vào trang Tổng quan
const OnTimeCard = lazy(() => import("./OnTimeCard"));

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải" />;
}

export default function OverviewPage() {
  const { user } = useAuth();
  const [classId, setClassId] = useState<number | "all">("all");
  const o = useTeacherOverview(classId);

  // Nếu lớp đang chọn không còn trong danh sách thì quay về "Tất cả lớp"
  const effectiveClassId = classId !== "all" && !o.classes.some((c) => c.id === classId) ? "all" : classId;
  const hasClasses = o.classes.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {greetingByHour(new Date().getHours())}, thầy/cô {user?.name}!
          </h1>
          <p className="mt-2 text-slate-500">Đây là tình hình các lớp học của thầy/cô hôm nay.</p>
        </div>
        <Button to="/teacher/exercises/new" size="lg" rightIcon={<Sparkles />}>
          Tạo bài tập mới
        </Button>
      </div>

      {o.isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được dữ liệu tổng quan từ máy chủ.
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
          label="Lớp đang dạy"
          value={formatNumber(o.stats.classCount)}
          sub={o.stats.newClasses30d > 0 ? `+${o.stats.newClasses30d} lớp mới trong 30 ngày` : "Chưa có lớp mới trong 30 ngày"}
          subClass="text-green-600"
          loading={o.isLoading}
        />
        <StatCard
          icon={BookOpen}
          tint="bg-green-50 text-green-600"
          label="Tổng số học sinh"
          value={formatNumber(o.stats.studentTotal)}
          sub={hasClasses ? `Trung bình ${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(o.stats.avgPerClass)} học sinh/lớp` : "Chưa có học sinh"}
          subClass="text-green-600"
          loading={o.isLoading}
        />
        <Link to="/teacher/grading" className="block rounded-3xl transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
          <StatCard
            icon={PenLine}
            tint="bg-amber-50 text-amber-600"
            label="Bài chờ chấm"
            value={formatNumber(o.pendingGrading.count)}
            sub={`${formatNumber(o.pendingGrading.waitingAi)} bài đang chờ AI chấm`}
            subClass="text-amber-600"
            loading={o.isLoading || o.submissionsLoading}
          />
        </Link>
        <StatCard
          icon={TrendingUp}
          tint="bg-green-50 text-green-600"
          label="Tỷ lệ hoàn thành"
          value={o.completion.rate === null ? "—" : `${o.completion.rate}%`}
          sub={`${formatNumber(o.completion.submitted)}/${formatNumber(o.completion.total)} lượt nộp trong 30 ngày`}
          subClass="text-green-600"
          loading={o.isLoading}
        />
      </div>

      {!o.isLoading && !o.isError && (o.failedCount > 0 || o.truncated) && (
        <div className="mt-4 space-y-2">
          {o.failedCount > 0 && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
              <span>Một số bài giao chưa tải được</span>
              <Button variant="outline" size="sm" onClick={o.retryFailed}>
                Thử lại
              </Button>
            </div>
          )}
          {o.truncated && <p className="text-xs text-slate-500">Danh sách bài giao quá dài nên một số bài cũ chưa được tính vào số liệu.</p>}
        </div>
      )}

      {o.isLoading ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : !o.isError && !hasClasses ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <School className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Thầy/cô chưa có lớp nào</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Tạo lớp và chia sẻ mã lớp để học sinh tham gia. Các thống kê sẽ hiện ở đây sau đó.</p>
          <div className="mt-5">
            <Button to="/teacher/classes">Tạo lớp</Button>
          </div>
        </div>
      ) : !o.isError && !o.hasAssignments && effectiveClassId === "all" ? (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <BookOpen className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Thầy/cô chưa giao bài nào</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Giao bài cho lớp để theo dõi tiến độ nộp bài và chấm điểm ngay tại đây.</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button to="/teacher/assignments/new">Giao bài mới</Button>
            <Button to="/teacher/classes" variant="outline">
              Xem lớp học
            </Button>
          </div>
        </div>
      ) : hasClasses && !o.isError ? (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Suspense fallback={<Skeleton className="h-80" />}>
              <OnTimeCard classes={o.classes} classId={effectiveClassId} onClassChange={setClassId} stats={o.onTime} sampleSize={o.analysedCount} />
            </Suspense>
            <AttentionCard students={o.attentionStudents} />
          </div>
          <div className="mt-6">
            <RecentAssignmentsCard assignments={o.recentAssignments} />
          </div>
        </>
      ) : null}
    </div>
  );
}
