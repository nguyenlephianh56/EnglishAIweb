import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { Check, CircleAlert, Inbox, Pencil, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { formatNumber } from "../../utils/format";
import { isAnswerableType } from "../exercises/registry";
import { typeLabel } from "../teacher/assignments/assignmentMeta";
import ExercisePreview from "../teacher/exercises/ExercisePreview";
import { formatUpdated } from "../teacher/exercises/exerciseMeta";
import { ApproveModal, RejectModal } from "./ExerciseDecisionForms";
import { SkillBadge, SourceBadge } from "./ExerciseBadges";
import { ADMIN_EXERCISES_PAGE_SIZE, useAdminExerciseList, useCreatorNames, useExerciseDecisions, usePendingProposalCount } from "./useAdminExercises";
import type { ExerciseListItem } from "../../types/exercise";

type Flash = { type: "success" | "error" | "warning"; text: string };
type Action = "approve" | "reject";

const th = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400";

/** /admin/proposals: bài giáo viên (hoặc AI) đề xuất vào thư viện, chờ quản trị viên duyệt. */
export default function ProposalsPage() {
  const [params, setParams] = useSearchParams();
  const parsed = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  const list = useAdminExerciseList({ status: "PROPOSED", page });
  const pendingCount = usePendingProposalCount();
  const names = useCreatorNames();
  const { approve, reject } = useExerciseDecisions();

  const location = useLocation();
  const navigate = useNavigate();
  const incomingNotice = (location.state as { notice?: string } | null)?.notice;
  const [flash, setFlash] = useState<Flash | null>(() => (incomingNotice ? { type: "success", text: incomingNotice } : null));
  useEffect(() => {
    if (incomingNotice) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selected, setSelected] = useState<ExerciseListItem | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<string | undefined>();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_EXERCISES_PAGE_SIZE));

  // Duyệt hết trang cuối thì lùi về trang trước
  useEffect(() => {
    if (!list.isFetching && !list.isError && items.length === 0 && page > 1) {
      const next = new URLSearchParams(params);
      if (page - 1 > 1) next.set("page", String(page - 1));
      else next.delete("page");
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.isFetching, list.isError, items.length, page]);

  const creator = (e: ExerciseListItem) => (e.createdById != null ? (names.get(e.createdById) ?? `#${e.createdById}`) : "—");
  const busy = approve.isPending || reject.isPending;

  function closeAll() {
    setSelected(null);
    setAction(null);
    setActionError(undefined);
  }

  function onFailed(err: unknown, target: ExerciseListItem) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    if (status === 409 || status === 404) {
      // Bài đã được xử lý ở nơi khác: cache đã được làm mới, bài biến mất khỏi danh sách
      closeAll();
      setFlash({ type: "warning", text: `Bài “${target.topic}” không còn ở trạng thái chờ duyệt. Danh sách đã được làm mới.` });
      return;
    }
    setActionError(getErrorMessage(err, "Không thực hiện được thao tác, vui lòng thử lại."));
  }

  async function confirmApprove() {
    if (!selected) return;
    const target = selected;
    setActionError(undefined);
    try {
      await approve.mutateAsync(target.id);
      closeAll();
      setFlash({ type: "success", text: `Đã duyệt bài “${target.topic}”. Bài đã vào thư viện chung.` });
    } catch (err) {
      onFailed(err, target);
    }
  }

  async function confirmReject(reason: string | undefined) {
    if (!selected) return;
    const target = selected;
    setActionError(undefined);
    try {
      await reject.mutateAsync({ id: target.id, reason });
      closeAll();
      setFlash({ type: "success", text: `Đã từ chối bài “${target.topic}”. Bài quay về bản nháp của người tạo.` });
    } catch (err) {
      onFailed(err, target);
    }
  }

  const count = pendingCount.data ?? (list.data ? total : undefined);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Duyệt đề xuất</h1>
        {count !== undefined && count > 0 && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-bold text-amber-700" aria-label={`${count} bài chờ duyệt`}>
            {formatNumber(count)} chờ duyệt
          </span>
        )}
      </div>
      <p className="mt-2 text-slate-500">Xem trước nội dung và đáp án, rồi duyệt để đưa bài vào thư viện chung hoặc từ chối để trả về bản nháp.</p>

      {flash && (
        <div className="mt-5">
          <Notice type={flash.type}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-6">
        {list.isError && !list.data ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách đề xuất.
            </span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : list.isLoading ? (
          <div className="space-y-3" role="status" aria-label="Đang tải">
            <div className="h-12 animate-pulse rounded-2xl bg-slate-200" />
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
              <Inbox className="size-6" />
            </span>
            <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không có bài nào chờ duyệt</p>
            <p className="mt-1 text-sm text-slate-500">Khi giáo viên gửi đề xuất, bài sẽ hiện ở đây.</p>
          </div>
        ) : (
          <div className={`transition-opacity ${list.isFetching ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <caption className="sr-only">Bài tập chờ duyệt</caption>
                <thead>
                  <tr className="border-b border-slate-100">
                    <th scope="col" className={th}>Chủ đề</th>
                    <th scope="col" className={th}>Dạng bài</th>
                    <th scope="col" className={th}>Kỹ năng</th>
                    <th scope="col" className={th}>Cấp độ</th>
                    <th scope="col" className={th}>Nguồn</th>
                    <th scope="col" className={th}>Người tạo</th>
                    <th scope="col" className={th}>Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((e) => (
                    <tr key={e.id} onClick={() => setSelected(e)} className="cursor-pointer transition-colors hover:bg-slate-50/60">
                      <td className="max-w-xs px-4 py-4">
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setSelected(e);
                          }}
                          className="max-w-full truncate rounded text-left font-bold text-slate-900 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                          title={e.topic}
                        >
                          {e.topic}
                        </button>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{typeLabel(e.type)}</td>
                      <td className="px-4 py-4"><SkillBadge skill={e.skill} /></td>
                      <td className="px-4 py-4 font-semibold text-slate-700">{e.level}</td>
                      <td className="px-4 py-4"><SourceBadge source={e.source} /></td>
                      <td className="px-4 py-4 text-slate-700">{creator(e)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatUpdated(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              onChange={(p) => {
                const next = new URLSearchParams(params);
                if (p > 1) next.set("page", String(p));
                else next.delete("page");
                setParams(next);
              }}
            />
          </div>
        )}
      </div>

      {/* Bảng xem trước: ẩn trong lúc hộp thoại xác nhận mở để không chồng hai hộp thoại */}
      <Modal size="lg" open={selected !== null && action === null} onClose={closeAll} title={selected?.topic ?? ""} description={selected ? `${typeLabel(selected.type)} · ${selected.level} · ${creator(selected)}` : undefined}>
        {selected && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <SkillBadge skill={selected.skill} />
              <SourceBadge source={selected.source} />
            </div>
            <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5">
              {!isAnswerableType(selected.type) && selected.type !== "speaking" && selected.type !== "writing" ? (
                <p className="text-sm text-slate-500">Không xem trước được dạng bài này.</p>
              ) : (
                <ExercisePreview type={selected.type} content={selected.content} answer={selected.answer} explanation={selected.explanation} />
              )}
            </div>
            {actionError && (
              <div className="mt-4">
                <Notice type="error">{actionError}</Notice>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Link
                to={`/admin/library/${selected.id}`}
                className="inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-slate-500 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
              >
                <Pencil className="size-4" aria-hidden="true" />
                Mở để sửa
              </Link>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={closeAll}>
                  Đóng
                </Button>
                <Button variant="danger" leftIcon={<X />} disabled={busy} onClick={() => { setActionError(undefined); setAction("reject"); }}>
                  Từ chối
                </Button>
                <Button leftIcon={<Check />} disabled={busy} onClick={() => { setActionError(undefined); setAction("approve"); }}>
                  Duyệt
                </Button>
              </div>
            </div>
          </>
        )}
      </Modal>

      <ApproveModal open={selected !== null && action === "approve"} topic={selected?.topic ?? ""} pending={approve.isPending} error={actionError} onClose={() => setAction(null)} onConfirm={() => void confirmApprove()} />
      <RejectModal open={selected !== null && action === "reject"} topic={selected?.topic ?? ""} pending={reject.isPending} error={actionError} onClose={() => setAction(null)} onConfirm={(r) => void confirmReject(r)} />
    </div>
  );
}
