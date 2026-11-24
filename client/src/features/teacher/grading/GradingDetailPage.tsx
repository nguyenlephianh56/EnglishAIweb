import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Clock } from "lucide-react";
import Button from "../../../components/ui/Button";
import { UserAvatar } from "../../../components/layout/AppLayout";
import { getErrorMessage } from "../../../api/client";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { typeLabel } from "../assignments/assignmentMeta";
import { attemptScoreText, gradingTargetId, sortedAttempts } from "../assignments/attemptMeta";
import { useAssignmentSubmissions } from "../assignments/useTeacherAssignments";
import AiSuggestion from "./AiSuggestion";
import GradingForm from "./GradingForm";
import SubmissionView from "./SubmissionView";
import { formatDateTime } from "./gradingMeta";
import { useAttemptReview } from "./useGrading";

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-3xl bg-slate-200 ${className}`} aria-hidden="true" />;
}

/** /teacher/grading/:id (id = mã lần nộp): xem bài nộp, gợi ý của AI và chấm điểm (GET /attempts/:id/review). Quản trị viên dùng chung. */
export default function GradingDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const idValid = Number.isInteger(id) && id > 0;
  const q = useAttemptReview(id);
  const review = q.data;

  // Học sinh trước/sau trong cùng bài giao (chỉ những bạn có bài để chấm)
  const assignmentId = review?.assignment?.id;
  const subs = useAssignmentSubmissions(assignmentId ?? 0);
  const order = (subs.data?.items ?? []).filter((s) => gradingTargetId(s) !== null);
  const position = review ? order.findIndex((s) => s.studentId === review.student.id) : -1;
  const prev = position > 0 ? order[position - 1] : undefined;
  const next = position >= 0 && position < order.length - 1 ? order[position + 1] : undefined;
  const prevId = prev ? gradingTargetId(prev) : null;
  const nextId = next ? gradingTargetId(next) : null;
  // Các lần nộp của học sinh đang xem: tìm theo mã lần nộp hiện tại
  const current = (subs.data?.items ?? []).find((s) => (s.attempts ?? []).some((a) => a.id === id));
  const attempts = current ? sortedAttempts(current) : [];

  const notFound = !idValid || (q.isError && axios.isAxiosError(q.error) && q.error.response?.status === 404);
  const backTo = assignmentId ? `/teacher/grading?assignmentId=${assignmentId}` : "/teacher/grading";

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 lg:px-8">
      <Link to={backTo} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Chấm bài
      </Link>

      {notFound ? (
        <div role="alert" className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="font-heading text-lg font-bold text-slate-900">Không mở được bài này</p>
          <p className="mt-1 text-sm text-slate-500">Bài này không thuộc lớp của bạn hoặc không tồn tại</p>
          <div className="mt-5">
            <Button to="/teacher/grading" variant="outline">
              Về danh sách chấm bài
            </Button>
          </div>
        </div>
      ) : q.isError ? (
        <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            {getErrorMessage(q.error, "Không tải được bài làm.")}
          </span>
          <span className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              Thử lại
            </Button>
            <Button variant="outline" size="sm" to="/teacher/grading">
              Về danh sách
            </Button>
          </span>
        </div>
      ) : q.isLoading || !review ? (
        <div className="mt-6 space-y-6" role="status" aria-label="Đang tải">
          <Skeleton className="h-24" />
          <div className="grid gap-6 lg:grid-cols-5">
            <Skeleton className="h-96 lg:col-span-3" />
            <Skeleton className="h-96 lg:col-span-2" />
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Chấm bài</h1>
              <p className="mt-2 text-slate-500">
                {review.exercise.topic} • {typeLabel(review.exercise.type)} {review.assignment && <> • Lớp {review.assignment.class.name}</>}
              </p>
            </div>
            {order.length > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" leftIcon={<ChevronLeft />} disabled={!prevId} onClick={() => prevId && navigate(`/teacher/grading/${prevId}`)}>
                  Học sinh trước
                </Button>
                <span className="min-w-14 text-center text-sm font-bold text-slate-700" aria-live="polite">
                  {position >= 0 ? `${position + 1} / ${order.length}` : "—"}
                </span>
                <Button variant="outline" size="sm" rightIcon={<ChevronRight />} disabled={!nextId} onClick={() => nextId && navigate(`/teacher/grading/${nextId}`)}>
                  Học sinh tiếp
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <UserAvatar name={review.student.name} />
              <div>
                <p className="font-bold text-slate-900">{review.student.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-4" aria-hidden="true" />
                    Nộp lúc {formatDateTime(review.submitted_at)}
                  </span>
                  {review.is_late && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-700">Nộp trễ</span>}
                </p>
              </div>
            </div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${(ANY_SKILL_META[review.exercise.skill] ?? ANY_SKILL_META.FOUNDATION).tint} ${(ANY_SKILL_META[review.exercise.skill] ?? ANY_SKILL_META.FOUNDATION).text}`}>
              {(ANY_SKILL_META[review.exercise.skill] ?? ANY_SKILL_META.FOUNDATION).label} • {review.exercise.level}
            </span>
          </div>

          {attempts.length > 1 && (
            <nav aria-label="Lần nộp" className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-500">Lần nộp</span>
              {attempts.map((a) => (
                <Link
                  key={a.id}
                  to={`/teacher/grading/${a.id}`}
                  aria-current={a.id === id ? "true" : undefined}
                  className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                    a.id === id ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                  }`}
                >
                  Lần {a.attempt_no} · {attemptScoreText(a)}
                  {a.is_late && <span className="rounded-full bg-red-50 px-1.5 text-[10px] font-bold text-red-700">Trễ</span>}
                </Link>
              ))}
            </nav>
          )}

          <div className="mt-6 grid items-start gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <SubmissionView key={review.attempt_id} review={review} />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <AiSuggestion review={review} />
              <GradingForm key={review.attempt_id} review={review} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
