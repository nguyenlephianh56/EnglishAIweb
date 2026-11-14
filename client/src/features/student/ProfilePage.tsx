import { lazy, Suspense, useState } from "react";
import { ArrowRight, ChartNoAxesColumn, ChevronDown, CircleAlert, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import Button from "../../components/ui/Button";
import { formatNumber } from "../../utils/format";
import { SKILL_META } from "./skillMeta";
import { useSkillProfile } from "./useSkillProfile";
import type { ProfileRange, SkillProfileData } from "../../types/profile";

// Recharts khá nặng: tải riêng khi vào trang Hồ sơ kỹ năng
const RadarCard = lazy(() => import("./RadarCard"));
const ProgressCard = lazy(() => import("./ProgressCard"));

const RANGES: { value: ProfileRange; label: string }[] = [
  { value: "7d", label: "7 ngày gần đây" },
  { value: "30d", label: "30 ngày gần đây" },
  { value: "90d", label: "90 ngày gần đây" },
];

const ERROR_BAR_COLORS = ["bg-skill-speaking", "bg-skill-listening", "bg-skill-reading", "bg-skill-writing"];

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} role="status" aria-label="Đang tải" />;
}

/** Vòng tròn cấp độ: nền xanh ngọc nhạt, cung đậm thể hiện tiến độ XP */
function LevelCard({ profile }: { profile: SkillProfileData }) {
  const { current, target } = profile.xp;
  const percent = Math.min(100, Math.round((current / target) * 100));
  const remaining = Math.max(target - current, 0);
  const r = 62;
  const circumference = 2 * Math.PI * r;

  return (
    <section className="flex h-full flex-col items-center rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8" aria-labelledby="h-level">
      <div className="relative size-36" aria-hidden="true">
        <svg viewBox="0 0 150 150" className="size-full -rotate-90">
          <circle cx="75" cy="75" r={r} fill="none" stroke="#CCFBF1" strokeWidth="12" />
          <circle cx="75" cy="75" r={r} fill="none" stroke="var(--color-secondary)" strokeWidth="12" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-heading text-4xl font-extrabold text-teal-600">{profile.level}</span>
          <span className="text-xs font-bold text-teal-600">{profile.levelLabel}</span>
        </div>
      </div>
      <h2 id="h-level" className="mt-5 font-heading text-xl font-bold text-slate-900">
        <span className="sr-only">Cấp độ {profile.level} {profile.levelLabel}. </span>
        Bạn đang tiến bộ rất tốt!
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {remaining > 0 ? (
          <>
            Chỉ còn <strong className="font-bold text-slate-900">{formatNumber(remaining)} điểm kinh nghiệm</strong> để hoàn thành cấp độ {profile.level}.
          </>
        ) : (
          <>Bạn đã hoàn thành cấp độ {profile.level}.</>
        )}
      </p>
      <div className="mt-5 w-full">
        <div className="h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={current} aria-label="Kinh nghiệm cấp độ hiện tại">
          <div className="h-full rounded-full bg-secondary" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1.5 flex justify-between text-xs text-slate-500">
          <span>{formatNumber(current)} XP</span>
          <span>{formatNumber(target)} XP</span>
        </p>
      </div>
    </section>
  );
}

function SkillScoreCards({ skills }: { skills: SkillProfileData["skills"] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {skills.map(({ skill, score, delta }) => {
        const meta = SKILL_META[skill];
        const Icon = meta.icon;
        const up = delta > 0;
        const down = delta < 0;
        const TrendIcon = down ? TrendingDown : TrendingUp;
        return (
          <li key={skill} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <span className={`grid size-11 place-items-center rounded-xl ${meta.tint} ${meta.text}`} aria-hidden="true">
              <Icon className="size-5" />
            </span>
            <div className="mt-4 flex items-baseline justify-between">
              <h3 className="font-heading text-base font-bold text-slate-900">{meta.label}</h3>
              <p className="font-heading text-3xl font-extrabold text-slate-900">
                {score}
                <span className="text-xs font-semibold text-slate-400">/100</span>
              </p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label={`Điểm ${meta.label}`}>
              <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${score}%` }} />
            </div>
            <p className={`mt-3 inline-flex items-center gap-1.5 text-xs font-semibold ${down ? "text-red-600" : up ? "text-green-600" : "text-slate-500"}`}>
              {(up || down) && <TrendIcon className="size-4" aria-hidden="true" />}
              {up ? `Tăng ${delta} điểm` : down ? `Giảm ${Math.abs(delta)} điểm` : "Không thay đổi"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function ErrorTypesCard({ profile }: { profile: SkillProfileData }) {
  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-errors">
      <h2 id="h-errors" className="font-heading text-xl font-bold text-slate-900">
        Loại lỗi hay mắc
      </h2>
      <p className="mt-1 text-sm text-slate-500">Dựa trên {profile.errorSampleSize} bài gần nhất</p>
      <ul className="mt-6 space-y-5">
        {profile.errorTypes.map((e, i) => (
          <li key={e.id}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">{e.label}</span>
              <span className="font-bold text-slate-900">{e.percent}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.percent} aria-label={e.label}>
              <div className={`h-full rounded-full ${ERROR_BAR_COLORS[i % ERROR_BAR_COLORS.length]}`} style={{ width: `${e.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WeaknessCard({ weaknesses }: { weaknesses: SkillProfileData["weaknesses"] }) {
  return (
    <section className="h-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="h-weak">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="h-weak" className="font-heading text-xl font-bold text-slate-900">
            Điểm yếu cần cải thiện
          </h2>
          <p className="mt-1 text-sm text-slate-500">AI phân tích và đề xuất cho bạn</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-light text-brand" aria-hidden="true">
          <Sparkles className="size-5" />
        </span>
      </div>
      <ul className="mt-4 divide-y divide-slate-100">
        {weaknesses.map((w) => {
          const meta = SKILL_META[w.skill];
          const Icon = meta.icon;
          return (
            <li key={w.id} className="flex items-center gap-4 py-4">
              <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${meta.tint} ${meta.text}`} aria-hidden="true">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">{w.title}</h3>
                <p className="mt-0.5 text-xs text-slate-500">{w.description}</p>
              </div>
              <Button to={`/student/library?skill=${w.skill}`} variant="outline" size="sm">
                {w.actionLabel}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function ProfilePage() {
  const [range, setRange] = useState<ProfileRange>("30d");
  const { data: profile, isLoading, isError, refetch } = useSkillProfile(range);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Hồ sơ kỹ năng</h1>
          <p className="mt-2 text-slate-500">Theo dõi năng lực và hiểu rõ điểm mạnh của bạn.</p>
        </div>
        <div className="relative">
          <label htmlFor="profile-range" className="sr-only">
            Khoảng thời gian
          </label>
          <select
            id="profile-range"
            value={range}
            onChange={(e) => setRange(e.target.value as ProfileRange)}
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

      {isError && (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được hồ sơ kỹ năng.
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Thử lại
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-[26rem] lg:col-span-3" />
            <Skeleton className="h-[26rem] lg:col-span-2" />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-44" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </div>
      )}

      {profile && !profile.hasData && (
        <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <ChartNoAxesColumn className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Chưa đủ dữ liệu, hãy làm bài đầu tiên</p>
          <p className="mt-1 text-sm text-slate-500">Hồ sơ kỹ năng sẽ được cập nhật sau mỗi bài bạn hoàn thành.</p>
          <div className="mt-5">
            <Button to="/student/library" rightIcon={<ArrowRight />}>
              Tới thư viện luyện tập
            </Button>
          </div>
        </div>
      )}

      {profile && profile.hasData && (
        <div className="mt-8 space-y-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <Suspense fallback={<Skeleton className="h-[26rem]" />}>
                <RadarCard profile={profile} />
              </Suspense>
            </div>
            <div className="lg:col-span-2">
              <LevelCard profile={profile} />
            </div>
          </div>

          <SkillScoreCards skills={profile.skills} />

          <Suspense fallback={<Skeleton className="h-96" />}>
            <ProgressCard points={profile.progress} />
          </Suspense>

          <div className="grid gap-6 lg:grid-cols-2">
            <ErrorTypesCard profile={profile} />
            <WeaknessCard weaknesses={profile.weaknesses} />
          </div>
        </div>
      )}
    </div>
  );
}
