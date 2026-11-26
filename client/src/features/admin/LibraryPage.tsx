import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { CircleAlert, Eye, EyeOff, FilePlus2, Pencil, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Pagination from "../../components/ui/Pagination";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { useAuth } from "../../hooks/useAuth";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { formatNumber } from "../../utils/format";
import { ANY_SKILL_META } from "../student/skillMeta";
import { LEVEL_OPTIONS, SKILL_OPTIONS } from "../student/libraryFilters";
import { typeLabel } from "../teacher/assignments/assignmentMeta";
import ExerciseFilterModal from "../teacher/exercises/ExerciseFilterModal";
import { formatUpdated, STATUS_BADGE, TYPE_FILTER_OPTIONS } from "../teacher/exercises/exerciseMeta";
import { canPublishDirectly, HideModal, PublishModal } from "./ExerciseDecisionForms";
import { SkillBadge, SourceBadge, StatusBadge } from "./ExerciseBadges";
import { ADMIN_EXERCISES_PAGE_SIZE, useAdminExerciseList, useExerciseDecisions } from "./useAdminExercises";
import { EXERCISE_STATUSES, useExerciseStatusCounts } from "./useAdminData";
import type { ExerciseListItem, ExerciseStatus } from "../../types/exercise";

type Flash = { type: "success" | "error" | "warning"; text: string };

const th = "px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-400";

/** /admin/library: toàn bộ bài tập ở mọi trạng thái; xem/sửa, ẩn bài, tạo bài mới hoặc nhờ AI sinh bài. */
export default function LibraryPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = EXERCISE_STATUSES.find((s) => s === params.get("status"));
  const q = params.get("q") ?? "";
  const skill = SKILL_OPTIONS.find((o) => o.value === params.get("skill"))?.value;
  const level = LEVEL_OPTIONS.find((l) => l === params.get("level"));
  const type = TYPE_FILTER_OPTIONS.find((o) => o.value === params.get("type"))?.value;
  const parsed = Number.parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

  const list = useAdminExerciseList({ status, skill, level, type, topic: q.trim() || undefined, page });
  const { counts } = useExerciseStatusCounts();
  const { hide, publish } = useExerciseDecisions();

  const location = useLocation();
  const navigate = useNavigate();
  const incomingNotice = (location.state as { notice?: string } | null)?.notice;
  const [flash, setFlash] = useState<Flash | null>(() => (incomingNotice ? { type: "success", text: incomingNotice } : null));
  useEffect(() => {
    if (incomingNotice) navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [filterOpen, setFilterOpen] = useState(false);
  const [decision, setDecision] = useState<{ kind: "hide" | "publish"; exercise: ExerciseListItem } | null>(null);
  const [decisionError, setDecisionError] = useState<string | undefined>();

  function update(patch: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace });
  }

  const [searchText, setSearchText] = useState(q);
  const debounced = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debounced.trim() !== q.trim()) update({ q: debounced.trim() || undefined }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    setSearchText(q);
  }, [q]);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_EXERCISES_PAGE_SIZE));
  const advanced = [skill, level, type].filter(Boolean).length;
  const hasFilters = advanced > 0 || q.trim() !== "" || status !== undefined;

  // Ẩn bài cuối của trang cuối thì lùi về trang trước
  useEffect(() => {
    if (!list.isFetching && !list.isError && items.length === 0 && page > 1) update({ page: page - 1 > 1 ? String(page - 1) : undefined }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.isFetching, list.isError, items.length, page]);

  function clearAll() {
    setSearchText("");
    update({ q: undefined, status: undefined, skill: undefined, level: undefined, type: undefined });
  }

  function openDecision(kind: "hide" | "publish", exercise: ExerciseListItem) {
    setDecisionError(undefined);
    setDecision({ kind, exercise });
  }

  async function confirmDecision() {
    if (!decision) return;
    const { kind, exercise } = decision;
    const mutation = kind === "hide" ? hide : publish;
    if (mutation.isPending) return;
    setDecisionError(undefined);
    try {
      await mutation.mutateAsync(exercise.id);
      setDecision(null);
      setFlash({ type: "success", text: kind === "hide" ? `Đã ẩn bài “${exercise.topic}”.` : `Đã xuất bản bài “${exercise.topic}” vào thư viện.` });
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setDecision(null);
        setFlash({ type: "warning", text: `Bài “${exercise.topic}” không còn tồn tại. Danh sách đã được làm mới.` });
        return;
      }
      setDecisionError(getErrorMessage(err, "Thao tác không thành công, vui lòng thử lại."));
    }
  }

  const activeChips = [
    skill && { key: "skill", label: ANY_SKILL_META[skill].label },
    level && { key: "level", label: level },
    type && { key: "type", label: typeLabel(type) },
  ].filter((c): c is { key: string; label: string } => Boolean(c));

  const chips: { id: ExerciseStatus | undefined; label: string }[] = [{ id: undefined, label: "Tất cả" }, ...EXERCISE_STATUSES.map((s) => ({ id: s, label: STATUS_BADGE[s].label }))];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Thư viện bài tập</h1>
          <p className="mt-2 text-slate-500">Toàn bộ bài tập ở mọi trạng thái: soạn, sửa, đăng hoặc ẩn bài.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button to="/admin/library/ai" variant="outline" leftIcon={<Sparkles />}>
            Nhờ AI sinh bài
          </Button>
          <Button to="/admin/library/new" leftIcon={<Plus />}>
            Tạo bài
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3">
        <Input className="flex-1" label="Tìm theo chủ đề" hideLabel name="q" placeholder="Tìm theo chủ đề" autoComplete="off" leftIcon={<Search />} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        <Button variant="outline" className="h-12 shrink-0" rightIcon={<SlidersHorizontal />} onClick={() => setFilterOpen(true)}>
          Bộ lọc
          {advanced > 0 && <span className="ml-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] text-white">{advanced}</span>}
        </Button>
      </div>

      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Bộ lọc đang bật" role="group">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => update({ [c.key]: undefined })}
              aria-label={`Bỏ lọc ${c.label}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1.5 text-xs font-bold text-brand-dark hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              {c.label}
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div role="group" aria-label="Lọc theo trạng thái" className="mt-6 flex flex-wrap gap-2">
        {chips.map((c) => {
          const selected = c.id === status;
          const count = c.id ? counts[c.id] : undefined;
          return (
            <button
              key={c.id ?? "all"}
              type="button"
              aria-pressed={selected}
              onClick={() => update({ status: c.id })}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c.label}
              {count !== undefined && <span className={`grid min-w-6 place-items-center rounded-full px-1.5 py-0.5 text-xs ${selected ? "bg-white/20 text-white" : "bg-white text-slate-600"}`}>{formatNumber(count)}</span>}
            </button>
          );
        })}
      </div>

      {flash && (
        <div className="mt-4">
          <Notice type={flash.type}>{flash.text}</Notice>
        </div>
      )}

      <div className="mt-4">
        {list.isError && !list.data ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách bài tập.
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
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-light text-brand" aria-hidden="true">
              <FilePlus2 className="size-6" />
            </span>
            {hasFilters ? (
              <>
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không có bài tập phù hợp</p>
                <p className="mt-1 text-sm text-slate-500">Hãy thử đổi từ khóa hoặc bỏ bớt bộ lọc.</p>
                <div className="mt-5">
                  <Button variant="outline" onClick={clearAll}>
                    Xóa bộ lọc
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">Thư viện chưa có bài tập nào</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Button to="/admin/library/ai" variant="outline" leftIcon={<Sparkles />}>
                    Nhờ AI sinh bài
                  </Button>
                  <Button to="/admin/library/new" leftIcon={<Plus />}>
                    Tạo bài
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={`transition-opacity ${list.isFetching ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <caption className="sr-only">Danh sách bài tập</caption>
                <thead>
                  <tr className="border-b border-slate-100">
                    <th scope="col" className={th}>Chủ đề</th>
                    <th scope="col" className={th}>Dạng bài</th>
                    <th scope="col" className={th}>Kỹ năng</th>
                    <th scope="col" className={th}>Cấp độ</th>
                    <th scope="col" className={th}>Trạng thái</th>
                    <th scope="col" className={th}>Nguồn</th>
                    <th scope="col" className={th}>Cập nhật</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((e) => (
                    <tr key={e.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="max-w-xs px-4 py-4">
                        <Link to={`/admin/library/${e.id}`} className="block truncate rounded font-bold text-slate-900 hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25" title={e.topic}>
                          {e.topic}
                        </Link>
                      </td>
                      <td className="px-4 py-4 text-slate-700">{typeLabel(e.type)}</td>
                      <td className="px-4 py-4"><SkillBadge skill={e.skill} /></td>
                      <td className="px-4 py-4 font-semibold text-slate-700">{e.level}</td>
                      <td className="px-4 py-4"><StatusBadge status={e.status} /></td>
                      <td className="px-4 py-4"><SourceBadge source={e.source} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatUpdated(e.updatedAt ?? e.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button to={`/admin/library/${e.id}`} variant="outline" size="sm" leftIcon={<Pencil />}>
                            Xem/Sửa
                          </Button>
                          {e.status !== "HIDDEN" && (
                            <Button variant="ghost" size="sm" leftIcon={<EyeOff />} onClick={() => openDecision("hide", e)}>
                              Ẩn
                            </Button>
                          )}
                          {canPublishDirectly(e, user?.id) && (
                            <Button variant="outline" size="sm" leftIcon={<Eye />} onClick={() => openDecision("publish", e)}>
                              {e.status === "HIDDEN" ? "Hiện lại" : "Xuất bản"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
          </div>
        )}
      </div>

      <ExerciseFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={{ skill, level, type }}
        onApply={(next) => {
          update({ skill: next.skill, level: next.level, type: next.type });
          setFilterOpen(false);
        }}
      />

      <HideModal open={decision?.kind === "hide"} topic={decision?.exercise.topic ?? ""} pending={hide.isPending} error={decisionError} onClose={() => setDecision(null)} onConfirm={() => void confirmDecision()} />
      <PublishModal open={decision?.kind === "publish"} topic={decision?.exercise.topic ?? ""} hidden={decision?.exercise.status === "HIDDEN"} pending={publish.isPending} error={decisionError} onClose={() => setDecision(null)} onConfirm={() => void confirmDecision()} />
    </div>
  );
}