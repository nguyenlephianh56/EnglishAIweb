import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ArrowLeft, Check, CircleAlert, EyeOff, Send, Sparkles, Trash2, X } from "lucide-react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Notice from "../../account/Notice";
import { getErrorMessage } from "../../../api/client";
import { useAuth } from "../../../hooks/useAuth";
import { ApproveModal, HideModal, RejectModal } from "../../admin/ExerciseDecisionForms";
import { isAnswerableType } from "../../exercises/registry";
import { typeLabel } from "../assignments/assignmentMeta";
import ExerciseForm from "./form/ExerciseForm";
import { focusFirstInvalid } from "./form/focus";
import { isFormType } from "./form/registry";
import { useExerciseForm } from "./form/useExerciseForm";
import ExercisePreview from "./ExercisePreview";
import { STATUS_BADGE } from "./exerciseMeta";
import { exerciseDetailKey, useExerciseDetail, useExerciseMutations } from "./useReviewExercise";
import { useExerciseBase } from "./useExerciseBase";
import type { ExerciseListItem } from "../../../types/exercise";

type Tab = "edit" | "preview";
function BackLink() {
  const { backPath, backLabel } = useExerciseBase();
  return (
    <Link
      to={backPath}
      className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {backLabel}
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8" role="status" aria-label="Đang tải">
      <div className="h-5 w-28 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-5 h-10 w-2/3 animate-pulse rounded-xl bg-slate-200" />
      <div className="mt-8 space-y-4">
        <div className="h-48 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-72 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    </div>
  );
}

/** Trang báo bài không có hoặc không có quyền, kèm đường quay lại */
function Unavailable({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  const { listPath, listLabel } = useExerciseBase();
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <BackLink />
      <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
          <CircleAlert className="size-6" />
        </span>
        <p className="mt-3 font-heading text-lg font-bold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{text}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Thử lại
            </Button>
          )}
          <Button to={listPath}>Về {listLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/**
 * /teacher/exercises/:id/review: giáo viên xem và chỉnh bài nháp (do AI sinh hoặc tự soạn), rồi gửi duyệt hoặc xóa.
 * /admin/library/:id: quản trị viên sửa bài ở mọi trạng thái, duyệt/từ chối bài chờ duyệt, hoặc ẩn bài.
 */
export default function ReviewExercisePage() {
  const id = Number(useParams().id);
  const { user } = useAuth();
  const { isAdmin } = useExerciseBase();
  const detail = useExerciseDetail(id);

  if (!Number.isInteger(id) || id <= 0) return <Unavailable title="Không tìm thấy bài tập" text="Đường dẫn không hợp lệ." />;
  if (detail.isLoading) return <Skeleton />;
  if (detail.isError || !detail.data) {
    const status = axios.isAxiosError(detail.error) ? detail.error.response?.status : undefined;
    if (status === 404 || status === 403) return <Unavailable title="Không tìm thấy bài tập" text={isAdmin ? "Bài này không tồn tại hoặc đã bị xóa." : "Bài này không tồn tại, đã bị xóa hoặc thầy/cô không có quyền xem."} />;
    return <Unavailable title="Không tải được bài tập" text={getErrorMessage(detail.error)} onRetry={() => void detail.refetch()} />;
  }
  const exercise = detail.data;
  // key theo trạng thái: khi bài đổi trạng thái (đã gửi duyệt...) thì dựng lại ở chế độ chỉ xem
  return <ReviewExerciseView key={`${exercise.id}-${exercise.status}`} exercise={exercise} isOwner={exercise.createdById === user?.id} />;
}

function ReviewExerciseView({ exercise, isOwner }: { exercise: ExerciseListItem; isOwner: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { update, propose, remove, approve, reject } = useExerciseMutations(exercise.id);
  const { isAdmin, backPath, listPath } = useExerciseBase();

  const status = exercise.status ?? "DRAFT";
  const supported = isFormType(exercise.type);
  // Giáo viên: chỉ bản nháp của mình. Quản trị viên: sửa được ở mọi trạng thái.
  const editable = supported && (isAdmin || (isOwner && status === "DRAFT"));
  const form = useExerciseForm("edit", exercise);

  const [tab, setTab] = useState<Tab>(editable ? "edit" : "preview");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"propose" | "delete" | "approve" | "reject" | "hide" | null>(null);
  const editRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ edit: null, preview: null });
  const leaving = useRef(false); // đang rời trang chủ động (gửi duyệt/xóa xong): không chặn nữa

  const busy = update.isPending || propose.isPending || remove.isPending || approve.isPending || reject.isPending;
  const dirty = editable && form.dirty;

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
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

  // Bài đổi trạng thái/quyền ở máy chủ (403, 409): làm mới để trang chuyển sang chế độ chỉ xem
  function onActionFailed(err: unknown) {
    setActionError(getErrorMessage(err, "Thao tác không thành công, vui lòng thử lại."));
    const code = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (code === 403 || code === 404 || code === 409) void queryClient.invalidateQueries({ queryKey: exerciseDetailKey(exercise.id) });
  }

  /** Kiểm tra rồi lưu các field đã đổi. Trả true nếu không có gì cần lưu hoặc lưu xong. */
  async function save(): Promise<boolean> {
    setActionError(null);
    setNotice(null);
    form.showErrors();
    if (Object.keys(form.validateAll()).length > 0) {
      setTab("edit");
      window.setTimeout(() => focusFirstInvalid(editRef.current), 0);
      return false;
    }
    const body = form.changes();
    if (Object.keys(body).length === 0) return true;
    try {
      await update.mutateAsync(body);
      form.markSaved();
      setNotice("Đã lưu thay đổi.");
      return true;
    } catch (err) {
      onActionFailed(err);
      return false;
    }
  }

  async function doPropose() {
    setConfirm(null);
    if (dirty && !(await save())) return;
    setActionError(null);
    try {
      await propose.mutateAsync();
      leaving.current = true;
      navigate("/teacher/exercises", { state: { notice: `Đã gửi bài “${exercise.topic}” để duyệt. Bài sẽ xuất hiện trong thư viện sau khi quản trị viên chấp thuận.` } });
    } catch (err) {
      onActionFailed(err);
    }
  }

  async function doDelete() {
    setConfirm(null);
    setActionError(null);
    try {
      await remove.mutateAsync();
      leaving.current = true;
      navigate(backPath, { state: { notice: `Đã xóa bản nháp “${exercise.topic}”.` } });
    } catch (err) {
      onActionFailed(err);
    }
  }

  // ---- Quản trị viên ----
  async function doHide() {
    setConfirm(null);
    setActionError(null);
    try {
      await remove.mutateAsync();
      leaving.current = true;
      navigate(listPath, { state: { notice: `Đã ẩn bài “${exercise.topic}”.` } });
    } catch (err) {
      onActionFailed(err);
    }
  }

  async function doApprove() {
    setConfirm(null);
    if (dirty && !(await save())) return;
    setActionError(null);
    try {
      await approve.mutateAsync();
      leaving.current = true;
      navigate("/admin/proposals", { state: { notice: `Đã duyệt bài “${exercise.topic}”. Bài đã vào thư viện chung.` } });
    } catch (err) {
      onActionFailed(err);
    }
  }

  async function doReject(reason: string | undefined) {
    setConfirm(null);
    setActionError(null);
    try {
      await reject.mutateAsync(reason);
      leaving.current = true;
      navigate("/admin/proposals", { state: { notice: `Đã từ chối bài “${exercise.topic}”. Bài quay về bản nháp của người tạo.` } });
    } catch (err) {
      onActionFailed(err);
    }
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next: Tab = tab === "edit" ? "preview" : "edit";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  const badge = STATUS_BADGE[status];
  const snap = editable ? form.snapshot() : null;
  const previewContent = snap ? snap.content : exercise.content;
  const previewAnswer = snap ? snap.answer : exercise.answer;
  const previewExplanation = snap ? snap.explanation : exercise.explanation;
  const readOnlyReason = !supported
    ? `Dạng bài “${exercise.type}” chưa chỉnh sửa được trên web.`
    : isAdmin
      ? ""
      : !isOwner
      ? "Thầy/cô không phải người tạo bài này nên chỉ xem được, không sửa, gửi duyệt hay xóa được."
      : `Bài đang ở trạng thái “${badge.label}” nên không chỉnh sửa được. Chỉ bản nháp mới sửa, gửi duyệt hoặc xóa được.`;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
      <BackLink />
      <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">{exercise.topic}</h1>
      <p className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span>
        {exercise.source === "AI" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
            <Sparkles className="size-3.5" aria-hidden="true" />
            AI tạo
          </span>
        )}
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{typeLabel(exercise.type)}</span>
        <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-bold text-green-700">{exercise.level}</span>
      </p>

      <div className="mt-5 space-y-3">
        {exercise.source === "AI" && (status === "DRAFT" || (isAdmin && status === "PROPOSED")) && (
          <Notice type="warning">{isAdmin ? "Bài do AI tạo — hãy kiểm tra từng câu hỏi và đáp án trước khi duyệt." : "Bản nháp do AI tạo — hãy kiểm tra từng câu hỏi và đáp án trước khi gửi duyệt."}</Notice>
        )}
        {!editable && readOnlyReason && <Notice type="warning">{readOnlyReason}</Notice>}
        {notice && <Notice type="success">{notice}</Notice>}
        {actionError && <Notice type="error">{actionError}</Notice>}
      </div>

      {editable && (
        <div role="tablist" aria-label="Chế độ xem bài" className="mt-6 inline-flex gap-1 rounded-full bg-slate-100 p-1">
          {(
            [
              { id: "edit", label: "Chỉnh sửa" },
              { id: "preview", label: "Xem trước" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`review-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="review-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKeyDown}
              className={`rounded-full px-5 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${tab === t.id ? "bg-brand text-white shadow" : "text-slate-600 hover:bg-slate-200"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel" id="review-panel" aria-labelledby={editable ? `review-tab-${tab}` : undefined} className="mt-6">
        {editable && tab === "edit" ? (
          <div ref={editRef}>
            <ExerciseForm mode="edit" form={form} pending={busy} hideActions onSubmit={() => void save()} />
          </div>
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {dirty && <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-800">Đang xem bản có thay đổi chưa lưu.</p>}
            {!isAnswerableType(exercise.type) && exercise.type !== "speaking" ? (
              <p className="text-sm text-slate-500">Không xem trước được dạng bài này.</p>
            ) : (
              <ExercisePreview type={exercise.type} content={previewContent} answer={previewAnswer} explanation={previewExplanation} />
            )}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {status !== "HIDDEN" ? (
            <Button variant="outline" leftIcon={<EyeOff />} disabled={busy} onClick={() => setConfirm("hide")}>
              Ẩn bài
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-3">
            {status === "PROPOSED" && (
              <>
                <Button variant="danger" leftIcon={<X />} disabled={busy} onClick={() => setConfirm("reject")}>
                  Từ chối
                </Button>
                <Button leftIcon={<Check />} disabled={busy} onClick={() => setConfirm("approve")}>
                  Duyệt
                </Button>
              </>
            )}
            {editable && (
              <Button variant={status === "PROPOSED" ? "outline" : "primary"} loading={update.isPending} disabled={!dirty || busy} onClick={() => void save()}>
                Lưu thay đổi
              </Button>
            )}
          </div>
        </div>
      )}

      {!isAdmin && editable && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" leftIcon={<Trash2 />} disabled={busy} onClick={() => setConfirm("delete")}>
            Xóa bản nháp
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" leftIcon={<Send />} disabled={busy} onClick={() => setConfirm("propose")}>
              Gửi duyệt
            </Button>
            <Button loading={update.isPending} disabled={!dirty || busy} onClick={() => void save()}>
              Lưu thay đổi
            </Button>
          </div>
        </div>
      )}

      <ApproveModal open={confirm === "approve"} topic={exercise.topic} pending={false} onClose={() => setConfirm(null)} onConfirm={() => void doApprove()} />
      <RejectModal open={confirm === "reject"} topic={exercise.topic} pending={false} onClose={() => setConfirm(null)} onConfirm={(r) => void doReject(r)} />
      <HideModal open={confirm === "hide"} topic={exercise.topic} pending={false} onClose={() => setConfirm(null)} onConfirm={() => void doHide()} />

      <Modal
        open={confirm === "propose"}
        onClose={() => setConfirm(null)}
        title="Gửi bài này để duyệt?"
        description="Quản trị viên cần duyệt trước khi bài xuất hiện trong thư viện chung. Sau khi gửi, thầy/cô không sửa hay xóa bài được nữa."
      >
        {dirty && <p className="rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-800">Các thay đổi chưa lưu sẽ được lưu trước khi gửi duyệt.</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Để sau
          </Button>
          <Button leftIcon={<Send />} onClick={() => void doPropose()}>
            Gửi duyệt
          </Button>
        </div>
      </Modal>

      <Modal open={confirm === "delete"} onClose={() => setConfirm(null)} title="Xóa bản nháp này?" description={`Bản nháp “${exercise.topic}” sẽ bị xóa và không khôi phục được.`}>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Giữ lại
          </Button>
          <Button variant="danger" leftIcon={<Trash2 />} onClick={() => void doDelete()}>
            Xóa bản nháp
          </Button>
        </div>
      </Modal>

      <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} title="Rời trang khi chưa lưu?" description="Thầy/cô có thay đổi chưa lưu. Nếu rời trang, các thay đổi này sẽ mất.">
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Ở lại chỉnh sửa
          </Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>
            Rời trang
          </Button>
        </div>
      </Modal>
    </div>
  );
}
