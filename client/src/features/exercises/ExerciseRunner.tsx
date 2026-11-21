import { useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CircleAlert, Clock, Loader2, Repeat, Send, TriangleAlert } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Notice from "../account/Notice";
import { getErrorCode, getErrorMessage } from "../../api/client";
import { SPEAKING_SUBMIT_TIMEOUT_MS, submitAttempt, uploadAttemptAudio } from "../../api/attempts";
import { formatDate, formatTime } from "../../utils/format";
import { ANY_SKILL_META } from "../student/skillMeta";
import { ASSIGNMENTS_KEY } from "../student/useAssignments";
import { DynamicExerciseView } from "./ExerciseView";
import { BackLink } from "./RunnerShell";
import { countWords } from "./answerUtils";
import { EXERCISE_REGISTRY, emptyValueFor, exerciseTypeLabel, isAnswerableType, isAnsweredFor, progressFor, toPayloadFor } from "./registry";
import { assignmentDetailKey } from "./useExerciseData";
import { ElapsedClock, WaitedSeconds } from "./writing/clocks";
import { speakingErrorMessage } from "./speaking/speakingErrors";
import { isAiOrNetworkError } from "./writing/submitErrors";
import { formatDraftTime, useWritingDraft } from "./writing/useWritingDraft";
import type { AnswerableExerciseType, ExerciseContentMap } from "../../types/exercise";
import type { SpeakingValue } from "../../types/exercise";
import type { StudentAssignmentDetail, StudentExercise, SubmitAttemptBody, SubmitOutcome } from "../../types/attempt";

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

  const isWriting = exercise.type === "writing";
  const isSpeaking = exercise.type === "speaking";

  // Bài Viết: tự lưu nháp theo bài (bài giao và tự luyện có khóa riêng)
  const draft = useWritingDraft(assignment ? `assignment-${assignment.assignmentId}` : String(exercise.id), isWriting);
  const [restoredAt, setRestoredAt] = useState<number | null>(draft.initial?.savedAt ?? null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const [value, setValue] = useState<unknown>(() => {
    if (!supported) return null;
    if (isWriting && draft.initial) return { text: draft.initial.text };
    return emptyValueFor(type, content as never);
  });
  const [touched, setTouched] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const finished = useRef(false); // đã nộp xong: không chặn điều hướng nữa

  // Bài Nói: giữ audio_id đã tải lên (gắn với đúng bản ghi) để nộp lại không phải tải lại; "uploading" -> "grading"
  const uploaded = useRef<{ blob: Blob; audioId: string } | null>(null);
  const [phase, setPhase] = useState<"uploading" | "grading">("uploading");

  async function submitSpeaking(body: Omit<SubmitAttemptBody, "answer">, blob: Blob): Promise<SubmitOutcome> {
    const target = { assignmentId: body.assignmentId, exerciseId: body.exerciseId };
    const upload = async () => {
      setPhase("uploading");
      const res = await uploadAttemptAudio(blob, target);
      uploaded.current = { blob, audioId: res.audio_id };
      return res.audio_id;
    };
    const send = (audioId: string) => {
      setPhase("grading");
      return submitAttempt({ ...body, answer: { audio_id: audioId } }, { timeoutMs: SPEAKING_SUBMIT_TIMEOUT_MS });
    };
    const audioId = uploaded.current?.blob === blob ? uploaded.current.audioId : await upload();
    try {
      return await send(audioId);
    } catch (e) {
      // audio_id hết hạn (khoảng 60 phút) hoặc file đã bị xóa: tải lại bản ghi đang giữ và thử đúng một lần nữa
      if (getErrorCode(e) !== "AUDIO_NOT_FOUND") throw e;
      uploaded.current = null;
      return send(await upload());
    }
  }

  const mutation = useMutation({
    mutationFn: ({ body, blob }: { body: SubmitAttemptBody; blob?: Blob }) => (blob ? submitSpeaking({ assignmentId: body.assignmentId, exerciseId: body.exerciseId }, blob) : submitAttempt(body)),
    onSuccess: (outcome) => {
      finished.current = true;
      draft.clear(); // nộp xong (kể cả khi AI chưa chấm được vì bài đã lưu trên máy chủ) thì bỏ nháp
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
    if (!supported || mutation.isPending) return; // chặn nộp đúp
    setConfirmOpen(false);
    const target = assignment ? { assignmentId: assignment.assignmentId } : { exerciseId: exercise.id };
    if (isSpeaking) {
      const blob = (value as SpeakingValue).blob;
      if (blob) mutation.mutate({ body: { ...target, answer: null }, blob });
      return;
    }
    mutation.mutate({ body: { ...target, answer: toPayloadFor(type, value as never) } });
  }

  function onSubmitClick() {
    if (!canSubmit) return;
    // Bài Viết luôn hỏi xác nhận (kèm số từ); dạng khác chỉ hỏi khi còn bỏ trống
    if (complete && !isWriting) send();
    else setConfirmOpen(true);
  }

  function discardDraft() {
    draft.clear();
    setValue(emptyValueFor(type, content as never));
    setRestoredAt(null);
    setTouched(false);
    setDiscardOpen(false);
  }

  const skill = ANY_SKILL_META[exercise.skill] ?? ANY_SKILL_META.FOUNDATION;
  const SkillIcon = skill.icon;
  const backTo = assignment ? "/student/assigned" : "/student/library";
  const unit = def?.unit ?? "";
  const missing = Math.max(0, progress.total - progress.done);
  const progressText = isWriting ? `Đã viết ${progress.done}/${progress.total} từ tối thiểu` : isSpeaking ? (complete ? "Đã có bản ghi âm" : "Chưa có bản ghi âm") : `Đã trả lời ${progress.done}/${progress.total} ${unit}`;

  return (
    <div className={`mx-auto px-5 py-8 lg:px-8 ${isWriting ? "max-w-6xl" : "max-w-4xl"}`}>
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
            <span className="flex items-center gap-3 font-semibold text-slate-500">
              {isWriting && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-4" aria-hidden="true" />
                  Thời gian làm: <ElapsedClock />
                </span>
              )}
              {percent}%
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-labelledby="runner-progress-label" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      {isWriting && restoredAt !== null && (
        <div role="status" className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800">
          <span>Đã khôi phục bản nháp lưu lúc {formatDraftTime(restoredAt)}</span>
          <Button variant="outline" size="sm" disabled={submitting} onClick={() => setDiscardOpen(true)}>
            Xóa nháp
          </Button>
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
            if (isWriting) draft.save((v as { text?: string }).text ?? "");
          }}
          mode="answering"
          disabled={submitting}
        />
      </div>

      {mutation.isError && (
        <div className="mt-4 space-y-3">
          <Notice type="error">{isSpeaking ? speakingErrorMessage(mutation.error) : getErrorMessage(mutation.error, "Không nộp được bài, vui lòng thử lại.")}</Notice>
          {isSpeaking && isAiOrNetworkError(mutation.error) && (
            <Button variant="outline" size="sm" leftIcon={<Repeat />} disabled={submitting || locked} onClick={send}>
              Thử nộp lại
            </Button>
          )}
          {isWriting && isAiOrNetworkError(mutation.error) && (
            <>
              <Notice type="warning">Bài của bạn đã được lưu; nộp lại có thể tính thêm 1 lượt với bài được giao.</Notice>
              <Button variant="outline" size="sm" leftIcon={<Repeat />} disabled={submitting || locked} onClick={send}>
                Thử nộp lại
              </Button>
            </>
          )}
        </div>
      )}

      {isWriting && submitting && (
        <p role="status" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-light p-4 text-sm font-semibold text-brand-dark">
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
          <span>
            AI đang chấm bài <span aria-hidden="true">(đã chờ <WaitedSeconds /> giây)</span>. Có thể mất vài giây, vui lòng không đóng trang.
          </span>
        </p>
      )}

      {isSpeaking && submitting && (
        <p role="status" aria-live="polite" className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-light p-4 text-sm font-semibold text-brand-dark">
          <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden="true" />
          {phase === "uploading" ? "Đang tải âm thanh…" : "AI đang nghe và chấm, có thể mất 20–60 giây…"}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {!supported
            ? "Dạng bài này chưa làm được trên web."
            : locked
              ? "Không thể nộp bài này nữa."
              : complete
                ? isSpeaking
                  ? "Nghe lại bản ghi rồi nộp bài nhé."
                  : "Em đã làm xong. Kiểm tra lại rồi nộp bài nhé."
                : isSpeaking
                  ? "Hãy ghi âm ít nhất 3 giây rồi bấm Nộp bài."
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
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isWriting ? "Nộp bài viết?" : "Nộp bài khi còn bỏ trống?"}
        description={isWriting ? `Bài viết của em có ${countWords((value as { text?: string } | null)?.text ?? "")} từ. Sau khi nộp, AI sẽ chấm điểm và không sửa bài được nữa.` : `Còn ${missing} ${unit} chưa làm. Phần bỏ trống sẽ được tính là sai.`}
      >
        {assignment && <p className="text-sm text-slate-600">Đây là bài giao: mỗi lần nộp tính là một lượt (còn {Math.max(0, assignment.maxAttempts - assignment.attemptsUsed)} lượt).</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            {isWriting ? "Viết tiếp" : "Làm tiếp"}
          </Button>
          <Button onClick={send}>{isWriting ? "Nộp bài" : "Vẫn nộp bài"}</Button>
        </div>
      </Modal>

      <Modal open={discardOpen} onClose={() => setDiscardOpen(false)} title="Xóa bản nháp?" description="Văn bản đang viết trong ô soạn thảo sẽ bị xóa và không khôi phục lại được.">
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDiscardOpen(false)}>
            Giữ lại
          </Button>
          <Button variant="danger" onClick={discardDraft}>
            Xóa nháp
          </Button>
        </div>
      </Modal>

      {/* Chặn điều hướng trong ứng dụng khi đang làm dở */}
      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Rời khỏi bài đang làm?" description={isWriting ? "Bản nháp được lưu trên máy này, nhưng bài chưa được nộp." : isSpeaking ? "Bản ghi âm chưa nộp sẽ bị mất nếu em rời trang." : "Bài làm dở sẽ không được lưu và sẽ mất nếu em rời trang."}>
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
