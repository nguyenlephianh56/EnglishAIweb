import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleCheck, ClipboardCheck, Flame, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { HOME_KEY, useHomeData } from "./useHomeData";
import AssignmentCard from "./AssignmentCard";
import RecommendationCard from "./RecommendationCard";
import JoinClassModal from "./JoinClassModal";
import type { JoinedClass } from "../../types/student";

// Recharts khá nặng: chỉ tải khi vào trang Trang chủ, không làm chậm trang giới thiệu/đăng nhập
const SkillProfileCard = lazy(() => import("./SkillProfileCard"));

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Chào buổi sáng";
  if (hour >= 12 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

function StreakBanner({ days }: { days: number }) {
  return (
    <section
      className="relative overflow-hidden rounded-3xl bg-linear-to-br from-brand-dark via-brand to-indigo-500 p-8 text-white shadow-lg shadow-brand/20 md:p-10"
      aria-label="Chuỗi học tập"
    >
      <span className="absolute -right-24 -top-32 size-[28rem] rounded-full bg-white/5" aria-hidden="true" />
      <span className="absolute -bottom-40 right-10 size-96 rounded-full bg-white/5" aria-hidden="true" />

      <div className="relative flex items-center justify-between gap-6">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-amber-300">
            <Flame className="size-4" aria-hidden="true" />
            CHUỖI HỌC TẬP ẤN TƯỢNG
          </p>
          <h2 className="mt-3 font-heading text-3xl font-extrabold tracking-tight">
            {days > 0 ? `${days} ngày liên tiếp, tuyệt lắm!` : "Bắt đầu chuỗi học của bạn hôm nay!"}
          </h2>
          <p className="mt-2 max-w-md text-indigo-100">Chỉ cần hoàn thành một bài hôm nay để duy trì chuỗi học của bạn.</p>
          <div className="mt-6">
            <Button to="/student/library" variant="outline" size="lg" rightIcon={<ArrowRight />}>
              Luyện tập ngay
            </Button>
          </div>
        </div>

        <div className="hidden shrink-0 text-center sm:block" aria-hidden="true">
          <div className="flex items-center gap-2">
            <span className="font-heading text-8xl font-extrabold leading-none">{days}</span>
            <Flame className="size-16 text-amber-400" strokeWidth={1.75} />
          </div>
          <p className="mt-2 text-sm font-bold tracking-widest text-indigo-100">NGÀY</p>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { data, isLoading, isError, refetch } = useHomeData();
  const queryClient = useQueryClient();

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinedName, setJoinedName] = useState<string | null>(null);

  // Thông báo "đã tham gia lớp" tự ẩn sau vài giây
  useEffect(() => {
    if (!joinedName) return;
    const t = window.setTimeout(() => setJoinedName(null), 6000);
    return () => window.clearTimeout(t);
  }, [joinedName]);

  function handleJoined(joined: JoinedClass) {
    setJoinOpen(false);
    setJoinedName(joined.name);
    queryClient.invalidateQueries({ queryKey: HOME_KEY }); // bài của lớp mới sẽ xuất hiện khi có API thật
  }

  const givenName = user?.name.trim().split(/\s+/).pop() ?? "";

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            {greeting(new Date().getHours())}, {givenName}!
          </h1>
          <p className="mt-2 text-slate-500">Hôm nay bạn muốn luyện kỹ năng gì?</p>
        </div>
        <Button variant="outline" size="lg" rightIcon={<Users />} onClick={() => setJoinOpen(true)}>
          Tham gia lớp
        </Button>
      </div>

      {joinedName && (
        <div role="status" className="mt-6 flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-700">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          Bạn đã tham gia lớp “{joinedName}” thành công.
        </div>
      )}

      {isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được dữ liệu trang chủ.
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="mt-8 space-y-8" role="status" aria-label="Đang tải">
          <Skeleton className="h-60" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-52" />
            <Skeleton className="h-52" />
          </div>
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-96 lg:col-span-3" />
            <Skeleton className="h-96 lg:col-span-2" />
          </div>
        </div>
      )}

      {data && (
        <>
          <div className="mt-8">
            <StreakBanner days={data.streak} />
          </div>

          <section className="mt-10" aria-labelledby="h-upcoming">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 id="h-upcoming" className="font-heading text-xl font-bold text-slate-900">
                  Bài sắp đến hạn
                </h2>
                <p className="mt-1 text-sm text-slate-500">Hoàn thành đúng hạn để không bỏ lỡ tiến độ.</p>
              </div>
              <Button to="/student/assigned" variant="ghost" size="sm" rightIcon={<ArrowRight />}>
                Xem tất cả
              </Button>
            </div>

            {data.assignments.length > 0 ? (
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                {data.assignments.map((a) => (
                  <AssignmentCard key={a.id} assignment={a} />
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
                  <ClipboardCheck className="size-6" />
                </span>
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">Chưa có bài sắp đến hạn</p>
                <p className="mt-1 text-sm text-slate-500">Khi giáo viên giao bài, các bài cần làm sẽ hiện ở đây.</p>
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Suspense fallback={<Skeleton className="h-96" />}>
                <SkillProfileCard profile={data.skillProfile} />
              </Suspense>
            </div>
            <div className="lg:col-span-2">
              <RecommendationCard recommendation={data.recommendation} />
            </div>
          </div>
        </>
      )}

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
    </div>
  );
}
