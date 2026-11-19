import { useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, GraduationCap, RotateCcw } from "lucide-react";
import Button from "../../components/ui/Button";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { regradeAttempt } from "../../api/attempts";
import { formatDateTime, formatScore } from "../teacher/grading/gradingMeta";
import { BackLink, PageError, PageSkeleton } from "./RunnerShell";
import { attemptKey, useAssignmentDetail, useAttemptDetail, usePracticeExercise } from "./useExerciseData";
import AutoResult from "./AutoResult";
import WritingResult from "./WritingResult";
import type { GradingError, StudentExercise } from "../../types/attempt";

/** Trang kết quả một lần nộp: /student/results/:attemptId. Luôn lấy qua GET /attempts/:id nên tải lại trang vẫn xem được. */
export default function ResultPage() {
  const params = useParams();
  const attemptId = Number(params.attemptId);
  const location = useLocation();
  const qc = useQueryClient();
  const gradingFromNav = (location.state as { gradingError?: GradingError } | null)?.gradingError;
  const [gradingMessage, setGradingMessage] = useState<string | undefined>(gradingFromNav?.message);
  const [regradeError, setRegradeError] = useState<string>();

  const attemptQ = useAttemptDetail(attemptId);
  const attempt = attemptQ.data;
  const assignmentId = attempt?.assignmentId ?? 0;
  const practiceId = attempt && attempt.assignmentId === null ? attempt.exerciseId : 0;
  const assignmentQ = useAssignmentDetail(assignmentId);
  const practiceQ = usePracticeExercise(practiceId);

  const regrade = useMutation({
    mutationFn: () => regradeAttempt(attemptId),
    onMutate: () => setRegradeError(undefined),
    onSuccess: (out) => {
      setGradingMessage(out.gradingError?.message);
      qc.invalidateQueries({ queryKey: attemptKey(attemptId) });
    },
    onError: (e) => setRegradeError(getErrorMessage(e)),
  });

  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return <PageError error={new Error("Không tìm thấy kết quả này.")} backTo="/student/library" backLabel="Về thư viện" />;
  }
  if (attemptQ.isLoading) return <PageSkeleton rows={2} />;
  if (attemptQ.isError || !attempt) {
    return <PageError error={attemptQ.error} onRetry={() => attemptQ.refetch()} backTo="/student/library" backLabel="Về thư viện" />;
  }

  const isAssignment = attempt.assignmentId !== null;
  const exercise: StudentExercise | undefined = isAssignment ? assignmentQ.data?.exercise : practiceQ.data;
  const assignment = assignmentQ.data;
  const submitted = attempt.submittedAnswer as { text?: unknown } | null;
  const isWriting = exercise ? exercise.type === "writing" : typeof submitted?.text === "string";
  const exerciseLoading = isAssignment ? assignmentQ.isLoading : practiceQ.isLoading;

  const shown = attempt.finalScore ?? attempt.score;
  const pending = shown === null;
  const percent = shown !== null && attempt.maxScore > 0 ? Math.min(100, Math.max(0, (shown / attempt.maxScore) * 100)) : 0;
  const adjusted = attempt.teacherScore !== null || (attempt.finalScore !== null && attempt.finalScore !== attempt.score);

  const backTo = isAssignment ? "/student/assigned" : "/student/library";
  const backLabel = isAssignment ? "Về bài được giao" : "Về thư viện";
  const attemptsLeft = assignment ? assignment.maxAttempts - assignment.attemptsUsed : attempt.attemptNo < 3 ? 1 : 0;
  const retakeTo = isAssignment ? (attemptsLeft > 0 ? `/student/assigned/${attempt.assignmentId}` : null) : `/student/library/${attempt.exerciseId}`;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <BackLink to={backTo}>{backLabel}</BackLink>

      <header className="mt-4">
        <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Kết quả bài làm</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          {exercise && <span className="font-semibold text-slate-700">{exercise.topic}</span>}
          <span>Lần {attempt.attemptNo}</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-4" aria-hidden="true" />
            {formatDateTime(attempt.submittedAt)}
          </span>
          {attempt.isLate && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600">Nộp trễ</span>}
        </p>
      </header>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-label="Điểm số">
        {pending ? (
          <p className="font-heading text-3xl font-extrabold text-slate-400">Đang chờ chấm</p>
        ) : (
          <p className="font-heading text-5xl font-extrabold text-brand">
            {formatScore(shown)}
            <span className="text-2xl font-bold text-slate-400">/{formatScore(attempt.maxScore)}</span>
          </p>
        )}
        {attempt.total > 0 && (
          <p className="mt-2 text-sm font-semibold text-slate-700">
            Đúng {attempt.correct}/{attempt.total} câu
          </p>
        )}
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Điểm"
          aria-valuemin={0}
          aria-valuemax={attempt.maxScore}
          aria-valuenow={shown ?? 0}
        >
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
        </div>

        {(attempt.teacherComment || adjusted) && (
          <div className="mt-5 rounded-2xl border border-teal-200 bg-teal-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-teal-800">
              <GraduationCap className="size-4" aria-hidden="true" />
              Điểm đã được giáo viên chỉnh
            </p>
            {attempt.teacherComment && <p className="mt-1 whitespace-pre-line text-sm text-teal-900">{attempt.teacherComment}</p>}
          </div>
        )}
      </section>

      <div className="mt-6">
        {isWriting ? (
          <WritingResult
            attempt={attempt}
            gradingMessage={gradingMessage}
            regrading={regrade.isPending}
            onReload={() => attemptQ.refetch()}
            reloading={attemptQ.isFetching}
            onRegrade={() => regrade.mutate()}
            regradeError={regradeError}
          />
        ) : exerciseLoading ? (
          <PageSkeleton rows={1} />
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {pending && (
              <div className="mb-4">
                <Notice type="error">Bài này chưa có điểm. Hãy thử tải lại.</Notice>
                <div className="mt-3">
                  <Button variant="outline" size="sm" disabled={attemptQ.isFetching} onClick={() => attemptQ.refetch()}>
                    Tải lại
                  </Button>
                </div>
              </div>
            )}
            <AutoResult attempt={attempt} exercise={exercise} />
          </section>
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {retakeTo && (
          <Button to={retakeTo} leftIcon={<RotateCcw />}>
            Làm lại
          </Button>
        )}
        <Button to={backTo} variant="outline">
          {backLabel}
        </Button>
        {/* "Xem lịch sử các lần làm": tạm ẩn vì chưa có trang lịch sử */}
      </div>
      {isAssignment && !retakeTo && <p className="mt-3 text-sm text-slate-500">Em đã dùng hết lượt làm bài này.</p>}
    </div>
  );
}
