import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleAlert, FilePlus2, Plus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import Notice from "../../account/Notice";
import { getErrorMessage } from "../../../api/client";
import { useAuth } from "../../../hooks/useAuth";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { formatNumber } from "../../../utils/format";
import { ANY_SKILL_META } from "../../student/skillMeta";
import { typeLabel } from "../assignments/assignmentMeta";
import ExerciseFilterModal from "./ExerciseFilterModal";
import ExercisesTable from "./ExercisesTable";
import { countAdvancedFilters, parseExerciseFilters, TABS } from "./exerciseMeta";
import type { ExerciseTab } from "./exerciseMeta";
import { useDraftCount, useExerciseActions, useExerciseList } from "./useTeacherExercises";
import type { ExerciseListItem } from "../../../types/exercise";

type Flash = { type: "success" | "error"; text: string };

/** /teacher/exercises: Ngân hàng bài tập, nối GET/POST/DELETE /exercises thật. */
export default function ExercisesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = parseExerciseFilters(params);
  const list = useExerciseList(filters, user?.id);
  const draftCount = useDraftCount(filters);
  const { propose, remove, duplicate } = useExerciseActions();

  const [flash, setFlash] = useState<Flash | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ExerciseListItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Đổi URL: đổi bộ lọc/tab thì về trang 1; replace = true khi gõ tìm kiếm để không đầy lịch sử
  function update(patch: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace });
  }

  // Ô tìm kiếm debounce 300ms, gửi vào tham số topic của API
  const [searchText, setSearchText] = useState(filters.q);
  const debounced = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debounced.trim() !== filters.q.trim()) update({ q: debounced.trim() || undefined }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  useEffect(() => {
    setSearchText(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const advanced = countAdvancedFilters(filters);
  const hasFilters = advanced > 0 || filters.q.trim() !== "";

  function clearAll() {
    setSearchText("");
    update({ q: undefined, skill: undefined, level: undefined, type: undefined });
  }

  // Số đếm chỉ hiện ở tab tính chính xác được: Bản nháp (total của server) và tab đang mở khi đã tải đủ dữ liệu
  const counts: Partial<Record<ExerciseTab, number>> = {};
  if (draftCount.data !== undefined) counts.draft = draftCount.data;
  if (filters.tab !== "draft" && !list.isLoading && !list.isError && list.exact) counts[filters.tab] = list.total;

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const index = TABS.findIndex((t) => t.id === filters.tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    update({ tab: TABS[next].id === "mine" ? undefined : TABS[next].id });
    tabRefs.current[TABS[next].id]?.focus();
  }

  async function runAction(e: ExerciseListItem, action: () => Promise<unknown>, okText: string, failText: string) {
    setFlash(null);
    setBusyId(e.id);
    try {
      await action();
      setFlash({ type: "success", text: okText });
    } catch (err) {
      setFlash({ type: "error", text: getErrorMessage(err, failText) });
    } finally {
      setBusyId(null);
    }
  }

  const onPropose = (e: ExerciseListItem) => runAction(e, () => propose.mutateAsync(e.id), `Đã gửi đề xuất bài “${e.topic}” vào thư viện. Quản trị viên sẽ duyệt.`, "Không gửi được đề xuất.");
  const onDuplicate = (e: ExerciseListItem) => runAction(e, () => duplicate.mutateAsync(e), `Đã nhân bản bài “${e.topic}”. Bản sao nằm ở tab Bản nháp.`, "Không nhân bản được bài tập.");

  async function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    await runAction(target, () => remove.mutateAsync(target.id), `Đã xóa bài “${target.topic}”.`, "Không xóa được bài tập.");
    setToDelete(null);
  }

  const activeChips = [
    filters.skill && { key: "skill", label: ANY_SKILL_META[filters.skill].label },
    filters.level && { key: "level", label: filters.level },
    filters.type && { key: "type", label: typeLabel(filters.type) },
  ].filter((c): c is { key: string; label: string } => Boolean(c));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Ngân hàng bài tập</h1>
          <p className="mt-2 text-slate-500">Quản lý và tái sử dụng nội dung cho các lớp học.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button to="/teacher/exercises/ai" variant="outline" leftIcon={<Sparkles />}>
            Nhờ AI sinh bài
          </Button>
          <Button to="/teacher/exercises/new" leftIcon={<Plus />}>
            Tạo bài tập
          </Button>
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3">
        <Input
          className="flex-1"
          label="Tìm theo chủ đề"
          hideLabel
          name="q"
          placeholder="Tìm theo chủ đề"
          autoComplete="off"
          leftIcon={<Search />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
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

      <div role="tablist" aria-label="Nhóm bài tập" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const selected = t.id === filters.tab;
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`ex-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="ex-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ tab: t.id === "mine" ? undefined : t.id })}
              onKeyDown={onTabKeyDown}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
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

      <div role="tabpanel" id="ex-panel" aria-labelledby={`ex-tab-${filters.tab}`} className="mt-4">
        {list.isError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            <span className="flex items-center gap-2">
              <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
              Không tải được danh sách bài tập.
            </span>
            <Button variant="outline" size="sm" onClick={list.refetch}>
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
        ) : list.items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
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
                <p className="mt-3 font-heading text-lg font-bold text-slate-900">Chưa có bài tập nào</p>
                <p className="mt-1 text-sm text-slate-500">Tạo bài tập đầu tiên để giao cho lớp của thầy/cô.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Button to="/teacher/exercises/ai" variant="outline" leftIcon={<Sparkles />}>
                    Nhờ AI sinh bài
                  </Button>
                  <Button to="/teacher/exercises/new" leftIcon={<Plus />}>
                    Tạo bài tập
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className={`transition-opacity ${list.isFetching ? "opacity-60" : ""}`} aria-busy={list.isFetching}>
            <ExercisesTable items={list.items} userId={user?.id} busyId={busyId} onPropose={onPropose} onDuplicate={onDuplicate} onDelete={(e) => setToDelete(e)} />
            <Pagination page={list.page} pageCount={list.pageCount} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
          </div>
        )}
      </div>

      <ExerciseFilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={{ skill: filters.skill, level: filters.level, type: filters.type }}
        onApply={(next) => {
          update({ skill: next.skill, level: next.level, type: next.type });
          setFilterOpen(false);
        }}
      />

      <Modal open={toDelete !== null} onClose={() => (busyId === null ? setToDelete(null) : undefined)} title="Xóa bài tập?" description={toDelete ? `Bài “${toDelete.topic}” sẽ bị ẩn khỏi ngân hàng bài tập.` : undefined}>
        <p className="text-sm text-slate-600">Các bài đã giao dùng bài này cũng sẽ không còn hiện trong danh sách bài của học sinh. Thao tác này không hoàn tác được từ giao diện.</p>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" disabled={busyId !== null} onClick={() => setToDelete(null)}>
            Hủy
          </Button>
          <Button variant="danger" loading={busyId !== null} onClick={confirmDelete}>
            Xóa
          </Button>
        </div>
      </Modal>
    </div>
  );
}
