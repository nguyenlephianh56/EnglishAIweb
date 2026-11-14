import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, CircleAlert, Search, SearchX, SlidersHorizontal } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useHomeData } from "./useHomeData";
import { useLibrary } from "./useLibrary";
import { LIBRARY_TOPICS } from "./mock/libraryData";
import { countActiveFilters, LEVEL_OPTIONS, parseFilters, SKILL_OPTIONS, SORT_OPTIONS, TYPE_OPTIONS } from "./libraryFilters";
import LibraryCard from "./LibraryCard";

/** Chip lọc: đang chọn thì nền indigo chữ trắng */
function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full px-4 py-2 text-xs font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
        selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="mr-1 w-16 shrink-0 text-sm font-bold text-slate-900">{label}</span>
      {children}
    </div>
  );
}

export default function LibraryPage() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);
  const lib = useLibrary(filters);
  const { data: home } = useHomeData();

  // Cập nhật URL: đổi bộ lọc thì về trang 1; replace = true cho gõ tìm kiếm để không đầy lịch sử
  function update(patch: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace });
  }

  // Ô tìm kiếm có debounce: gõ xong 300ms mới đẩy lên URL
  const [searchText, setSearchText] = useState(filters.q);
  const debounced = useDebouncedValue(searchText, 300);
  useEffect(() => {
    if (debounced !== filters.q) update({ q: debounced || undefined }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // URL đổi từ nơi khác (Xóa bộ lọc, nút Back) thì đồng bộ lại ô gõ
  useEffect(() => {
    setSearchText(filters.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.q]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [draftTopic, setDraftTopic] = useState<string | undefined>(filters.topic);
  const activeCount = countActiveFilters(filters);

  function clearAll() {
    setSearchText("");
    setParams(new URLSearchParams(), { replace: false });
  }
  function openFilter() {
    setDraftTopic(filters.topic);
    setFilterOpen(true);
  }
  function applyFilter() {
    update({ topic: draftTopic });
    setFilterOpen(false);
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Thư viện luyện tập</h1>
      <p className="mt-2 text-slate-500">Luyện tập theo kỹ năng và trình độ phù hợp với bạn.</p>

      <div className="mt-6 flex items-start gap-3">
        <Input
          className="flex-1"
          label="Tìm bài luyện tập"
          hideLabel
          name="q"
          placeholder="Tìm bài luyện tập..."
          autoComplete="off"
          leftIcon={<Search />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button variant="outline" size="md" className="h-12 shrink-0" rightIcon={<SlidersHorizontal />} onClick={openFilter}>
          Bộ lọc
          {filters.topic && <span className="ml-1 grid size-5 place-items-center rounded-full bg-brand text-[11px] text-white">1</span>}
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        <ChipRow label="Kỹ năng">
          <Chip selected={!filters.skill} onClick={() => update({ skill: undefined })}>
            Tất cả
          </Chip>
          {SKILL_OPTIONS.map((o) => (
            <Chip key={o.value} selected={filters.skill === o.value} onClick={() => update({ skill: o.value })}>
              {o.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <ChipRow label="Cấp độ">
            {LEVEL_OPTIONS.map((l) => (
              <Chip key={l} selected={filters.level === l} onClick={() => update({ level: filters.level === l ? undefined : l })}>
                {l}
              </Chip>
            ))}
          </ChipRow>
          <span className="hidden h-6 w-px bg-slate-300 sm:block" aria-hidden="true" />
          <ChipRow label="Dạng bài">
            {TYPE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={filters.type === o.value} onClick={() => update({ type: filters.type === o.value ? undefined : o.value })}>
                {o.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <h2 className="font-heading text-base font-bold text-slate-900" aria-live="polite">
          {lib.isLoading ? "Đang tải..." : `${lib.total} bài luyện tập`}
        </h2>
        <div className="relative">
          <label htmlFor="library-sort" className="sr-only">
            Sắp xếp
          </label>
          <select
            id="library-sort"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value === "newest" ? undefined : e.target.value })}
            className="appearance-none rounded-lg bg-transparent py-1 pl-2 pr-7 text-sm font-semibold text-slate-600 outline-none focus-visible:ring-4 focus-visible:ring-brand/20"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
        </div>
      </div>

      {lib.isError ? (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <span className="flex items-center gap-2">
            <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
            Không tải được danh sách bài luyện tập.
          </span>
          <Button variant="outline" size="sm" onClick={() => lib.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : lib.isLoading ? (
        <div className="mt-5 grid gap-6 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Đang tải">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-96 animate-pulse rounded-3xl bg-slate-200" />
          ))}
        </div>
      ) : lib.items.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-400" aria-hidden="true">
            <SearchX className="size-6" />
          </span>
          <p className="mt-3 font-heading text-lg font-bold text-slate-900">Không tìm thấy bài phù hợp</p>
          <p className="mt-1 text-sm text-slate-500">Hãy thử đổi từ khóa hoặc bỏ bớt bộ lọc.</p>
          <div className="mt-5">
            <Button onClick={clearAll}>Xóa bộ lọc</Button>
          </div>
        </div>
      ) : (
        <>
          <div className={`mt-5 grid gap-6 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${lib.isFetching ? "opacity-60" : ""}`} aria-busy={lib.isFetching}>
            {lib.items.map((e) => (
              <LibraryCard key={e.id} exercise={e} studentLevel={home?.skillProfile.level} />
            ))}
          </div>
          <Pagination page={lib.page} pageCount={lib.pageCount} onChange={(p) => update({ page: p > 1 ? String(p) : undefined })} />
        </>
      )}

      <Modal open={filterOpen} onClose={() => setFilterOpen(false)} title="Bộ lọc" description="Lọc thêm theo chủ đề bài luyện tập.">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">Chủ đề</legend>
          <div className="flex flex-wrap gap-2">
            {[undefined, ...LIBRARY_TOPICS].map((t) => {
              const selected = draftTopic === t;
              return (
                <label key={t ?? "all"} className="cursor-pointer">
                  <input type="radio" name="topic" checked={selected} onChange={() => setDraftTopic(t)} className="peer sr-only" />
                  <span
                    className={`block rounded-full px-4 py-2 text-xs font-bold transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand/25 ${
                      selected ? "bg-brand text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {t ?? "Tất cả chủ đề"}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-8 flex justify-end gap-3">
          <Button
            variant="outline"
            disabled={activeCount === 0 && !draftTopic}
            onClick={() => {
              clearAll();
              setFilterOpen(false);
            }}
          >
            Xóa lọc
          </Button>
          <Button onClick={applyFilter}>Áp dụng</Button>
        </div>
      </Modal>
    </div>
  );
}
