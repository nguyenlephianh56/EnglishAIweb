import { lazy, Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, CircleCheck, ClipboardCheck, Users } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { ASSIGNMENTS_KEY, useAssignmentList } from "./useAssignments";
import { useSkillProfile } from "./useSkillProfile";
import { RECOMMENDATIONS_KEY, useRecommendations } from "./useRecommendations";
import AssignedCard from "./AssignedCard";
import RecommendationCard from "./RecommendationCard";
import JoinClassModal from "./JoinClassModal";
import type { SkillProfileData } from "../../types/profile";
import type { JoinedClass, SkillProfileSummary } from "../../types/student";

// Recharts khá nặng: chỉ tải khi vào trang Trang chủ, không làm chậm trang giới thiệu/đăng nhập
const SkillProfileCard = lazy(() => import("./SkillProfileCard"));

const HOME_ASSIGNMENT_COUNT = 3;
const HOME_ASSIGNMENT_FILTERS = { status: "NOT_STARTED", page: 1 } as const;

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return "Chào buổi sáng";
  if (hour >= 12 && hour < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** Lỗi của MỘT khối: các khối khác vẫn hiện bình thường */
function SectionError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex h-full flex-wrap items-center justify-between gap-3 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-700">
      <span className="flex items-center gap-2">
        <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
        {text}
      </span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

const toSummary = (d: SkillProfileData): SkillProfileSummary => ({ level: d.level, levelLabel: d.levelLabel, overall: d.overall, monthlyDelta: d.deltaPoints, axes: d.radar });

function AssignmentsSection() {
  const list = useAssignmentList(HOME_ASSIGNMENT_FILTERS);
  const items = (list.data?.items ?? []).slice(0, HOME_ASSIGNMENT_COUNT);

  return (
    <section className="mt-10" aria-labelledby="h-upcoming">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="h-upcoming" className="font-heading text-xl font-bold text-slate-900">
            Bài cần làm
          </h2>
          <p className="mt-1 text-sm text-slate-500">Hoàn thành đúng hạn để không bỏ lỡ tiến độ.</p>
        </div>
        <Button to="/student/assigned" variant="ghost" size="sm" rightIcon={<ArrowRight />}>
          Xem tất cả
        </Button>
      </div>

      <div className="mt-5">
        {list.isError ? (
          <SectionError text="Không tải được bài được giao." onRetry={() => void list.refetch()} />
        ) : list.isLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((a) => (
              <AssignedCard key={a.id} item={a} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <ClipboardCheck className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">Chưa có bài cần làm</p>
            <p className="mt-1 text-sm text-slate-500">Khi giáo viên giao bài, các bài chưa làm sẽ hiện ở đây.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function SkillProfileSection() {
  const profile = useSkillProfile("30d");

  if (profile.isError) return <SectionError text="Không tải được hồ sơ kỹ năng." onRetry={() => void profile.refetch()} />;
  if (profile.isLoading || !profile.data) return <Skeleton className="h-96" />;
  if (!profile.data.hasData) {
    return (
      <section className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-skill-profile">
        <h2 id="h-skill-profile" className="font-heading text-xl font-bold text-slate-900">
          Hồ sơ kỹ năng
        </h2>
        <p className="mt-4 flex-1 text-sm text-slate-500">Chưa có dữ liệu kỹ năng. Hãy làm vài bài luyện tập để AI đánh giá điểm mạnh và điểm yếu của bạn.</p>
        <div className="mt-4">
          <Button to="/student/library" rightIcon={<ArrowRight />}>
            Đến Thư viện luyện tập
          </Button>
        </div>
      </section>
    );
  }
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <SkillProfileCard profile={toSummary(profile.data)} />
    </Suspense>
  );
}

function RecommendationSection() {
  const rec = useRecommendations(1);
  if (rec.isError) return <SectionError text="Không tải được bài gợi ý." onRetry={() => void rec.refetch()} />;
  if (rec.isLoading) return <Skeleton className="h-96" />;
  return <RecommendationCard recommendation={rec.data?.[0] ?? null} />;
}

export default function HomePage() {
  const { user } = useAuth();
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
    // Bài của lớp mới xuất hiện trong danh sách; bài gợi ý cũng có thể đổi
    void queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
    void queryClient.invalidateQueries({ queryKey: RECOMMENDATIONS_KEY });
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

      <AssignmentsSection />

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SkillProfileSection />
        </div>
        <div className="lg:col-span-2">
          <RecommendationSection />
        </div>
      </div>

      <JoinClassModal open={joinOpen} onClose={() => setJoinOpen(false)} onJoined={handleJoined} />
    </div>
  );
}
