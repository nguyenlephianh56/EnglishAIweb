import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useBlocker } from "react-router-dom";
import axios from "axios";
import { CircleAlert, GraduationCap, Sparkles } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Textarea from "../../../components/ui/Textarea";
import Notice from "../../account/Notice";
import { getErrorMessage } from "../../../api/client";
import { formatScore, isAiGradedType, isValidScore, parseScore, round2 } from "./gradingMeta";
import { useSaveTeacherGrade } from "./useGrading";
import type { AttemptReview, TeacherGradeBody } from "../../../types/attemptReview";

const COMMENT_MAX = 1000;
const NOT_IN_CLASS = "Bài này không thuộc lớp của bạn hoặc không tồn tại";

/**
 * Cột phải: điểm cuối (kèm huy hiệu ai chấm), ô điểm giáo viên, nhận xét. Chỉ gửi field thay đổi (PATCH /attempts/:id/grade).
 * Gắn `key={attempt_id}` để đổi bài thì nạp lại. Rời trang khi còn thay đổi chưa lưu thì hỏi xác nhận.
 */
export default function GradingForm({ review }: { review: AttemptReview }) {
  const save = useSaveTeacherGrade(review.attempt_id);
  const [score, setScore] = useState(review.teacher_score === null ? "" : String(review.teacher_score));
  const [comment, setComment] = useState(review.teacher_comment ?? "");
  const [saved, setSaved] = useState(false);

  // ---- Kiểm tra dữ liệu và phát hiện thay đổi ----
  const scoreEmpty = score.trim() === "";
  const scoreNum = parseScore(score);
  const scoreError = !scoreEmpty && !isValidScore(scoreNum) ? "Điểm phải là số từ 0 đến 10" : undefined;
  const trimmed = comment.trim();
  const commentError = trimmed.length > COMMENT_MAX ? `Nhận xét tối đa ${COMMENT_MAX} ký tự` : undefined;

  const nextScore = scoreEmpty ? null : round2(scoreNum);
  const nextComment = trimmed === "" ? null : trimmed;
  const scoreChanged = !scoreError && nextScore !== review.teacher_score;
  const commentChanged = !commentError && nextComment !== review.teacher_comment;
  const dirty = Boolean(scoreError) || Boolean(commentError) || scoreChanged || commentChanged;
  const canSave = !scoreError && !commentError && (scoreChanged || commentChanged) && !save.isPending;

  // ---- Cảnh báo khi rời trang với thay đổi chưa lưu ----
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaved(false);
    const body: TeacherGradeBody = {};
    if (scoreChanged) body.teacher_score = nextScore;
    if (commentChanged) body.teacher_comment = nextComment;
    save.mutate(body, {
      onSuccess: (res) => {
        // Đồng bộ ô nhập với giá trị máy chủ đã lưu (điểm làm tròn 2 chữ số, nhận xét đã bỏ khoảng trắng thừa)
        setScore(res.teacher_score === null ? "" : String(res.teacher_score));
        setComment(res.teacher_comment ?? "");
        setSaved(true);
      },
    });
  }

  function clearTeacherScore() {
    setSaved(false);
    save.mutate({ teacher_score: null }, { onSuccess: () => { setScore(""); setSaved(true); } });
  }

  const byTeacher = review.teacher_score !== null;
  const badge = byTeacher ? "Giáo viên đã chấm" : isAiGradedType(review.exercise.type) ? "AI chấm" : "Chấm tự động";
  const saveError = save.isError ? (axios.isAxiosError(save.error) && save.error.response?.status === 404 ? NOT_IN_CLASS : getErrorMessage(save.error, "Không lưu được điểm, vui lòng thử lại.")) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-slate-900">
        <GraduationCap className="size-5 text-brand" aria-hidden="true" />
        Chấm điểm của giáo viên
      </h2>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Điểm hiện tại của học sinh</p>
          <p className="font-heading text-3xl font-extrabold text-slate-900" aria-live="polite">
            {review.final_score === null ? "—" : formatScore(review.final_score)}
            <span className="text-lg font-bold text-slate-400">/10</span>
          </p>
        </div>
        {review.final_score !== null && (
          <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${byTeacher ? "bg-teal-50 text-teal-700" : "bg-slate-200 text-slate-700"}`}>{badge}</span>
        )}
      </div>

      <div className="mt-5 flex items-start gap-3">
        <div className="flex-1">
          <Input
            label="Điểm giáo viên (0–10)"
            type="number"
            inputMode="decimal"
            step={0.5}
            min={0}
            max={10}
            autoComplete="off"
            value={score}
            onChange={(e) => {
              setSaved(false);
              setScore(e.target.value);
            }}
            error={scoreError}
          />
          <p className="mt-1 text-xs text-slate-500">
            Để trống nếu muốn giữ điểm{isAiGradedType(review.exercise.type) ? " AI" : " tự động"}
            {review.score !== null && <> ({formatScore(review.score)})</>}.
          </p>
        </div>
        <div className="mt-8 flex shrink-0 flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={<Sparkles />}
            disabled={review.grading_status === "PENDING" || review.score === null || save.isPending}
            onClick={() => {
              setSaved(false);
              setScore(String(review.score));
            }}
          >
            Dùng điểm AI
          </Button>
          {byTeacher && (
            <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={clearTeacherScore}>
              Xóa điểm giáo viên
            </Button>
          )}
        </div>
      </div>

      <Textarea
        className="mt-5"
        label="Nhận xét cho học sinh"
        rows={6}
        limit={COMMENT_MAX}
        value={comment}
        onChange={(e) => {
          setSaved(false);
          setComment(e.target.value);
        }}
        error={commentError}
      />

      {saveError && (
        <div className="mt-3">
          <Notice type="error">{saveError}</Notice>
        </div>
      )}
      {saved && !dirty && (
        <div className="mt-3">
          <Notice type="success">Đã lưu. Học sinh sẽ thấy điểm và nhận xét này.</Notice>
        </div>
      )}

      <Button type="submit" fullWidth className="mt-4" loading={save.isPending} disabled={!canSave}>
        Lưu
      </Button>
      {!dirty && !saved && <p className="mt-2 text-center text-xs text-slate-400">Chưa có thay đổi nào để lưu.</p>}

      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Rời trang khi chưa lưu?" description="Điểm hoặc nhận xét thầy/cô vừa nhập chưa được lưu và sẽ mất.">
        <div className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Bấm Lưu trước nếu thầy/cô muốn giữ thay đổi.
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Ở lại chấm tiếp
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Rời trang
          </Button>
        </div>
      </Modal>
    </form>
  );
}
