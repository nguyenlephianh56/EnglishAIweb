import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, Loader2, Repeat, Send, TriangleAlert } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { submitAttempt } from "../../api/attempts";
import { formatDate, formatTime } from "../../utils/format";
import { ANY_SKILL_META } from "../student/skillMeta";
import { ASSIGNMENTS_KEY } from "../student/useAssignments";
import { DynamicExerciseView } from "./ExerciseView";
import { BackLink } from "./RunnerShell";
import { EXERCISE_REGISTRY, emptyValueFor, exerciseTypeLabel, isAnswerableType, isAnsweredFor, progressFor, toPayloadFor } from "./registry";
import { assignmentDetailKey } from "./useExerciseData";
import type { AnswerableExerciseType, ExerciseContentMap } from "../../types/exercise";
import type { StudentAssignmentDetail, StudentExercise } from "../../types/attempt";

/**
 * Bài giao đã quá hạn thì có khóa nộp không? Backend VẪN nhận bài nộp trễ (chỉ đánh dấu "Nộp trễ"),
 * nên mặc định chỉ cảnh báo, không khóa. Đổi thành true nếu muốn khóa hẳn sau hạn.
 */
const LOCK_WHEN_OVERDUE = false;

interface ExerciseRunnerProps {
  exercise: StudentExercise;
  /** Có khi làm bài giao; không có = tự luyện */
  assignment?: Omit<StudentAssignmentDetail, "exercise">;
}

const fmtDue = (iso: string) => {
  const d = new Date(iso);
  return `${formatTime(d)}, ${formatDate(d)}`;
};

/**
 * Component làm bài DÙNG CHUNG cho tự luyện (/student/library/:id) và bài giao (/student/assigned/:id):
 * đề + renderer theo registry, thanh tiến độ, nộp bài (POST /attempts), cảnh báo rời trang khi đang làm dở.
 */
export default function ExerciseRunner({ exercise, assignment }: ExerciseRunnerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const supported = isAnswerableType(exercise.type);
  const type = exercise.type as AnswerableExerciseType;
  const content = exercise.content as ExerciseContentMap[AnswerableExerciseType];

  const [value, setValue] = useState<unknown>(() => (supported ? emptyValueFor(type, content as never) : null));
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finished = useRef(false); // đã nộp xong: không chặn điều hướng nữa

  const mutation = useMutation({
    mutationFn: submitAttempt,
    onSuccess: (outcome) => {
      finished.current = true;
      void queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
      if (assignment) void queryClient.invalidateQueries({ queryKey: assignmentDetailKey(assignment.assignmentId) });
      navigate(`/student/results/${outcome.result.attemptId}`, { state: outcome.gradingError ? { gradingError: outcome.gradingError } : undefined });
    },
    onError: () => {
      // Lỗi như hết lượt nộp: tải lại số lượt để màn hình phản ánh đúng
      if (assignment) void queryClient.invalidateQueries({ queryKey: assignmentDetailKey(assignment.assignmentId) });
    },
  });
  const submitting = mutation.isPending;

  // ---- Tiến độ và điều kiện nộp ----
  const def = supported ? EXERCISE_REGISTRY[type] : null;
  const progress = supported ? progressFor(type, value as never, content as never) : { done: 0, total: 0 };
  const complete = supported && isAnsweredFor(type, value as never, content as never);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const isWriting = exercise.type === "writing";

  // ---- Trạng thái bài giao ----
  const overdue = assignment ? Date.now() > new Date(assignment.dueAt).getTime() : false;
  const exhausted = assignment ? assignment.attemptsUsed >= assignment.maxAttempts : false;
  const locked = exhausted || (LOCK_WHEN_OVERDUE && overdue);

  // Khóa hẳn: hết lượt, chưa làm gì, hoặc bài Viết chưa đủ số từ. Còn bỏ trống một phần thì được nộp sau khi xác nhận.
  const canSubmit = supported && !locked && !submitting && (complete || (Boolean(def?.allowPartialSubmit) && progress.done > 0));

  // ---- Cảnh báo rời trang khi đang làm dở ----
  const dirty = touched && !finished.current;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => touched && !finished.current && currentLocation.pathname !== nextLocation.pathname);

  function send() {
    if (!supported) return;
    setConfirmOpen(false);
    mutation.mutate({
      ...(assignment ? { assignmentId: assignment.assignmentId } : { exerciseId: exercise.id }),
      answer: toPayloadFor(type, value as never),
    });
  }

  function onSubmitClick() {
    if (!canSubmit) return;
    if (complete) send();
    else setConfirmOpen(true);
  }

  const skill = ANY_SKILL_META[exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
  const SkillIcon = skill.icon;
  const backTo = assignment ? "/student/assigned" : "/student/library";
  const unit = def?.unit ?? "";
  const missing = Math.max(0, progress.total - progress.done);
  const progressText = isWriting ? `Đã viết ${progress.done}/${progress.total} từ tối thiểu` : `Đã trả lời ${progress.done}/${progress.total} ${unit}`;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 lg:px-8">
      <BackLink to={backTo}>{assignment ? "Bài được giao" : "Thư viện luyện tập"}</BackLink>

      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{exercise.topic}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${skill.tint} ${skill.text}`}>
          <SkillIcon className="size-3.5" aria-hidden="true" />
          {skill.label}
        </span>
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{exercise.level}</span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{exerciseTypeLabel(exercise.type)}</span>
      </p>

      {assignment && (
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Thông tin bài giao">
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <CalendarClock className="size-4" aria-hidden="true" />
                Hạn nộp
              </dt>
              <dd className={`mt-1 font-bold ${overdue ? "text-red-600" : "text-slate-900"}`}>{fmtDue(assignment.dueAt)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Repeat className="size-4" aria-hidden="true" />
                Số lần làm
              </dt>
              <dd className="mt-1 font-bold text-slate-900">
                Đã làm {assignment.attemptsUsed}/{assignment.maxAttempts} lần
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">Lớp</dt>
              <dd className="mt-1 font-bold text-slate-900">{assignment.class.name}</dd>
            </div>
          </dl>
        </section>
      )}

      {assignment && exhausted && (
        <div className="mt-4">
          <Notice type="error">{`Bạn đã dùng hết ${assignment.maxAttempts} lần nộp cho bài này. Vẫn có thể xem đề nhưng không nộp thêm được.`}</Notice>
        </div>
      )}
      {assignment && overdue && !exhausted && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {LOCK_WHEN_OVERDUE ? "Bài giao đã quá hạn nộp. Vẫn có thể xem đề nhưng không nộp được." : "Bài giao đã quá hạn nộp. Nếu nộp bây giờ, bài sẽ bị đánh dấu là nộp trễ."}
        </div>
      )}

      {/* Thanh tiến độ */}
      {supported && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-bold text-slate-900" id="runner-progress-label">
              {progressText}
            </span>
            <span className="font-semibold text-slate-500">{percent}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-labelledby="runner-progress-label" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <DynamicExerciseView
          type={exercise.type}
          content={exercise.content}
          value={value}
          onChange={(v) => {
            setValue(v);
            setTouched(true);
          }}
          mode="answering"
          disabled={submitting}
        />
      </div>

      {mutation.isError && (
        <div className="mt-4">
          <Notice type="error">{getErrorMessage(mutation.error, "Không nộp được bài, vui lòng thử lại.")}</Notice>
        </div>
      )}

      {isWriting && submitting && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-light p-4 text-sm font-semibold text-brand-dark">
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
          AI đang chấm bài, có thể mất vài giây. Vui lòng không đóng trang.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {!supported
            ? "Dạng bài này chưa làm được trên web."
            : locked
              ? "Không thể nộp bài này nữa."
              : complete
                ? "Em đã làm xong. Kiểm tra lại rồi nộp bài nhé."
                : isWriting
                  ? `Cần viết thêm ${missing} từ để nộp bài.`
                  : progress.done === 0
                    ? "Hãy làm bài rồi bấm Nộp bài."
                    : `Còn ${missing} ${unit} chưa làm.`}
        </p>
        <Button size="lg" leftIcon={submitting ? <Loader2 className="animate-spin" /> : <Send />} disabled={!canSubmit} aria-busy={submitting || undefined} onClick={onSubmitClick}>
          {submitting ? "Đang chấm…" : "Nộp bài"}
        </Button>
      </div>

      {/* Xác nhận khi còn bỏ trống */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Nộp bài khi còn bỏ trống?" description={`Còn ${missing} ${unit} chưa làm. Phần bỏ trống sẽ được tính là sai.`}>
        {assignment && <p className="text-sm text-slate-600">Đây là bài giao: mỗi lần nộp tính là một lượt (còn {Math.max(0, assignment.maxAttempts - assignment.attemptsUsed)} lượt).</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Làm tiếp
          </Button>
          <Button onClick={send}>Vẫn nộp bài</Button>
        </div>
      </Modal>

      {/* Chặn điều hướng trong ứng dụng khi đang làm dở */}
      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Rời khỏi bài đang làm?" description="Bài làm dở sẽ không được lưu và sẽ mất nếu em rời trang.">
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Hãy nộp bài trước nếu em muốn giữ kết quả.
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Ở lại làm tiếp
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Rời trang
          </Button>
        </div>
      </Modal>
    </div>
  );
}
