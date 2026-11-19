import { useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Clock, Info } from "lucide-react";
import Button from "../../../components/ui/Button";
import { UserAvatar } from "../../../components/layout/AppLayout";
import GradingForm from "./GradingForm";
import AnnotatedText from "../../exercises/shared/AnnotatedText";
import ErrorList from "../../exercises/shared/ErrorList";
import { countWords, formatDateTime } from "./gradingMeta";
import { useGradingList, useGradingSubmission } from "./useGrading";
import type { GradingSubmission } from "../../../types/grading";

type TextTab = "marked" | "original";
const TEXT_TABS: { id: TextTab; label: string }[] = [
  { id: "marked", label: "Bài viết" },
  { id: "original", label: "Bản gốc" },
];

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** Cột trái: bài làm (đoạn lỗi gạch đỏ kèm số) và danh sách lỗi cần sửa. */
function EssayPanel({ submission }: { submission: GradingSubmission }) {
  const [tab, setTab] = useState<TextTab>("marked");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { errors } = submission.ai;
  const [active, setActive] = useState<number | null>(null);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "marked" ? "original" : "marked";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="essay-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="essay-title" className="font-heading text-lg font-bold text-slate-900">
              Bài làm của học sinh
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>{countWords(submission.text)} từ</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden="true" />
                Thời gian làm: {submission.durationMin} phút
              </span>
            </p>
          </div>
          <div role="tablist" aria-label="Chế độ xem bài" className="flex gap-1 rounded-full bg-slate-100 p-1">
            {TEXT_TABS.map((t) => {
              const selected = t.id === tab;
              return (
                <button
                  key={t.id}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`essay-tab-${t.id}`}
                  aria-selected={selected}
                  aria-controls="essay-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={onTabKeyDown}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${selected ? "bg-brand text-white shadow" : "text-slate-600 hover:bg-slate-200"}`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" id="essay-panel" aria-labelledby={`essay-tab-${tab}`} className="mt-5">
          {tab === "original" ? (
            <div className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-5 text-[15px] leading-8 text-slate-800">{submission.text}</div>
          ) : (
            <AnnotatedText text={submission.text} errors={errors} activeIndex={active} onActiveChange={setActive} />
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="errors-title">
        <h2 id="errors-title" className="font-heading text-lg font-bold text-slate-900">
          Lỗi cần sửa ({errors.length})
        </h2>
        <div className="mt-4">
          <ErrorList errors={errors} text={submission.text} activeIndex={active} onActiveChange={setActive} />
        </div>
      </section>
    </div>
  );
}

/** /teacher/grading/:id: Chấm bài viết. Dữ liệu GIẢ (xem features/teacher/mock/gradingData.ts). */
export default function GradingDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const detail = useGradingSubmission(id);
  const list = useGradingList();

  const order = list.data ?? [];
  const position = order.findIndex((s) => s.id === id);
  const prev = position > 0 ? order[position - 1] : undefined;
  const next = position >= 0 && position < order.length - 1 ? order[position + 1] : undefined;
  const s = detail.data;
  const late = s ? new Date(s.submittedAt).getTime() > new Date(s.dueAt).getTime() : false;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <Link
        to="/teacher/grading"
        className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Bài cần chấm
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Chấm bài viết</h1>
          <p className="mt-2 text-slate-500">{s ? `${s.exerciseTitle} • Lớp ${s.className}` : "Đang tải..."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" leftIcon={<ChevronLeft />} disabled={!prev} onClick={() => prev && navigate(`/teacher/grading/${prev.id}`)}>
            Học sinh trước
          </Button>
          <span className="min-w-14 text-center text-sm font-bold text-slate-700" aria-live="polite">
            {position >= 0 ? `${position + 1} / ${order.length}` : "—"}
          </span>
          <Button variant="outline" size="sm" rightIcon={<ChevronRight />} disabled={!next} onClick={() => next && navigate(`/teacher/grading/${next.id}`)}>
            Học sinh tiếp
          </Button>
        </div>
      </div>

      {detail.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            {detail.error instanceof Error ? detail.error.message : "Không tải được bài làm."}
          </span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
              Thử lại
            </Button>
            <Button variant="outline" size="sm" to="/teacher/grading">
              Về danh sách
            </Button>
          </span>
        </div>
      ) : detail.isLoading || !s ? (
        <div className="mt-6 space-y-6" role="status" aria-label="Đang tải">
          <Skeleton className="h-20" />
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-96 lg:col-span-3" />
            <Skeleton className="h-96 lg:col-span-2" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <UserAvatar name={s.studentName} />
              <div>
                <p className="font-bold text-slate-900">{s.studentName}</p>
                <p className="text-sm text-slate-500">
                  Nộp lúc {formatDateTime(s.submittedAt)} • <span className={late ? "font-semibold text-red-600" : "font-semibold text-green-700"}>{late ? "Nộp trễ" : "Đúng hạn"}</span>
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
              <Info className="size-4" aria-hidden="true" />
              Điểm AI chỉ mang tính tham khảo
            </span>
          </div>

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <EssayPanel key={s.id} submission={s} />
            </div>
            <div className="lg:col-span-2">
              <GradingForm key={s.id} submission={s} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
