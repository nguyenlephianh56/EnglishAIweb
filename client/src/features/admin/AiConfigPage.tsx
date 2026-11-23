import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { getErrorMessage } from "../../api/client";
import { formatDate } from "../../utils/format";
import AiLimitsForm from "./AiLimitsForm";
import PromptEditor from "./PromptEditor";
import { promptLabel } from "./aiMeta";
import { usePromptList } from "./useAdminAi";

type TabId = "prompts" | "limits";
const TABS: { id: TabId; label: string }[] = [
  { id: "prompts", label: "Prompt AI" },
  { id: "limits", label: "Giới hạn lượt AI" },
];

function PromptsTab() {
  const list = usePromptList();
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null); // prompt muốn chuyển tới khi còn thay đổi chưa lưu
  const dirty = useRef(false);
  const onDirtyChange = useCallback((d: boolean) => {
    dirty.current = d;
  }, []);

  const prompts = list.data ?? [];
  const current = selected ?? prompts[0]?.key ?? null;

  function choose(key: string) {
    if (key === current) return;
    if (dirty.current) setPending(key);
    else setSelected(key);
  }

  if (list.isError) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        <span className="flex items-center gap-2">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {getErrorMessage(list.error, "Không tải được danh sách prompt.")}
        </span>
        <Button variant="outline" size="sm" onClick={() => void list.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }
  if (list.isLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-3" role="status" aria-label="Đang tải">
        <div className="h-80 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-96 animate-pulse rounded-3xl bg-slate-200 lg:col-span-2" />
      </div>
    );
  }
  if (prompts.length === 0) return <p className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Chưa có prompt nào.</p>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-3">
      <ul className="space-y-2" aria-label="Danh sách prompt">
        {prompts.map((p) => {
          const active = p.key === current;
          return (
            <li key={p.key}>
              <button
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => choose(p.key)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                  active ? "border-brand bg-brand-light/50" : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">{promptLabel(p.key)}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${p.is_default ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{p.is_default ? "Mặc định" : "Đã chỉnh sửa"}</span>
                </span>
                <span className="mt-1 block text-xs text-slate-400">{p.updated_at ? `Cập nhật ${formatDate(new Date(p.updated_at))}` : "Chưa chỉnh sửa"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="lg:col-span-2">{current && <PromptEditor key={current} promptKey={current} onDirtyChange={onDirtyChange} />}</div>

      <Modal open={pending !== null} onClose={() => setPending(null)} title="Bỏ thay đổi chưa lưu?" description="Prompt đang sửa có thay đổi chưa lưu. Nếu chuyển sang prompt khác, các thay đổi này sẽ mất.">
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setPending(null)}>
            Ở lại chỉnh sửa
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setSelected(pending);
              setPending(null);
            }}
          >
            Chuyển và bỏ thay đổi
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** /admin/ai-config: sửa prompt AI và giới hạn lượt dùng AI mỗi ngày. */
export default function AiConfigPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabId = params.get("tab") === "limits" ? "limits" : "prompts";
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function go(id: TabId) {
    const next = new URLSearchParams(params);
    if (id === "prompts") next.delete("tab");
    else next.set("tab", id);
    setParams(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tab === "prompts" ? "limits" : "prompts";
    go(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
      <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">Cấu hình AI</h1>
      <p className="mt-2 text-slate-500">Điều chỉnh prompt gửi cho AI và số lượt dùng AI mỗi ngày.</p>

      <div role="tablist" aria-label="Cấu hình AI" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`ai-tab-${t.id}`}
              aria-selected={selected}
              aria-controls="ai-panel"
              tabIndex={selected ? 0 : -1}
              onClick={() => go(t.id)}
              onKeyDown={onKeyDown}
              className={`rounded-full px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${
                selected ? "bg-brand text-white shadow-md shadow-brand/25" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id="ai-panel" aria-labelledby={`ai-tab-${tab}`} className="mt-6">
        {/* Giữ PromptsTab đang mở (chỉ ẩn) để đổi tab không làm mất thay đổi chưa lưu */}
        <div hidden={tab !== "prompts"}>
          <PromptsTab />
        </div>
        {tab === "limits" && (
          <div className="max-w-2xl">
            <AiLimitsForm />
          </div>
        )}
      </div>
    </div>
  );
}
