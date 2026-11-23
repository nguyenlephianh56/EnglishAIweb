import { useEffect, useRef, useState } from "react";
import { CircleAlert, RotateCcw, Save } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Notice from "../account/Notice";
import { getErrorMessage } from "../../api/client";
import { getPromptErrorVariables } from "../../api/adminAi";
import { formatDate } from "../../utils/format";
import { PROMPT_MAX_LENGTH, promptLabel } from "./aiMeta";
import { usePromptDetail, usePromptMutations } from "./useAdminAi";
import type { PromptDetail } from "../../types/adminAi";

const placeholder = (name: string) => `{{${name}}}`;

interface Props {
  promptKey: string;
  /** Báo cho trang cha biết có thay đổi chưa lưu (để chặn khi đổi prompt khác) */
  onDirtyChange: (dirty: boolean) => void;
}

/** Trình sửa một mẫu prompt. Tải chi tiết (kèm template) rồi cho sửa, lưu, khôi phục mặc định. */
export default function PromptEditor({ promptKey, onDirtyChange }: Props) {
  const query = usePromptDetail(promptKey);

  if (query.isLoading) return <div className="h-96 animate-pulse rounded-3xl bg-slate-200" role="status" aria-label="Đang tải" />;
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
        <span className="flex items-center gap-2">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {getErrorMessage(query.error, "Không tải được prompt.")}
        </span>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Thử lại
        </Button>
      </div>
    );
  }
  return <EditorBody prompt={query.data} onDirtyChange={onDirtyChange} />;
}

function EditorBody({ prompt, onDirtyChange }: { prompt: PromptDetail; onDirtyChange: (dirty: boolean) => void }) {
  const { save, reset } = usePromptMutations(prompt.key);
  // null = chưa sửa gì, hiển thị đúng template đang lưu
  const [draft, setDraft] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"save" | "reset" | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);

  const text = draft ?? prompt.template;
  const dirty = draft !== null && draft !== prompt.template;
  const busy = save.isPending || reset.isPending;
  const tooLong = text.length > PROMPT_MAX_LENGTH;
  const empty = text.trim().length === 0;
  const hasNul = text.includes("\0");
  const invalid = tooLong || empty || hasNul;
  const missing = prompt.required.filter((v) => !text.includes(placeholder(v)));

  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  // Cảnh báo khi đóng/tải lại tab với thay đổi chưa lưu
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Đặt lại con trỏ sau khi chèn biến
  useEffect(() => {
    if (caret.current !== null && areaRef.current) {
      areaRef.current.focus();
      areaRef.current.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  function insertVariable(name: string) {
    const el = areaRef.current;
    const tag = placeholder(name);
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    caret.current = start + tag.length;
    setDraft(text.slice(0, start) + tag + text.slice(end));
  }

  function errorNotice(err: unknown, fallback: string) {
    const vars = getPromptErrorVariables(err);
    const message = getErrorMessage(err, fallback);
    setNotice({ type: "error", text: vars.length > 0 ? `${message} Biến liên quan: ${vars.map(placeholder).join(", ")}.` : message });
  }

  async function doSave() {
    setConfirm(null);
    setNotice(null);
    try {
      await save.mutateAsync(text);
      setDraft(null);
      setNotice({ type: "success", text: "Đã lưu prompt. Thay đổi có hiệu lực trong ít phút." });
    } catch (err) {
      errorNotice(err, "Không lưu được prompt, vui lòng thử lại.");
    }
  }

  async function doReset() {
    setConfirm(null);
    setNotice(null);
    try {
      await reset.mutateAsync();
      setDraft(null);
      setNotice({ type: "success", text: "Đã khôi phục prompt mặc định." });
    } catch (err) {
      errorNotice(err, "Không khôi phục được prompt, vui lòng thử lại.");
    }
  }

  const counterOver = tooLong;
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="prompt-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="prompt-title" className="font-heading text-xl font-bold text-slate-900">
            {promptLabel(prompt.key)}
          </h2>
          <p className="mt-1 font-mono text-xs text-slate-400">{prompt.key}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${prompt.is_default ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"}`}>{prompt.is_default ? "Mặc định" : "Đã chỉnh sửa"}</span>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor="prompt-template" className="block text-sm font-bold text-slate-900">
            Nội dung prompt
          </label>
          <span className={`text-xs font-semibold ${counterOver ? "text-red-600" : "text-slate-400"}`} aria-live="polite">
            {text.length}/{PROMPT_MAX_LENGTH}
          </span>
        </div>
        <textarea
          ref={areaRef}
          id="prompt-template"
          value={text}
          rows={18}
          spellCheck={false}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={invalid ? true : undefined}
          className={`min-h-64 w-full resize-y rounded-xl border bg-white px-4 py-3 font-mono text-[13px] leading-6 text-slate-900 outline-none transition-colors focus:ring-4 disabled:bg-slate-50 ${
            invalid ? "border-red-500 focus:border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-brand focus:ring-brand/20"
          }`}
        />
        {(empty || tooLong || hasNul) && (
          <p role="alert" className="mt-1.5 text-sm font-semibold text-red-600">
            {empty ? "Prompt không được để trống." : tooLong ? `Prompt tối đa ${PROMPT_MAX_LENGTH} ký tự.` : "Prompt không được chứa ký tự NUL."}
          </p>
        )}
      </div>

      <div className="mt-4">
        <p className="text-sm font-bold text-slate-900">Biến có thể dùng</p>
        {prompt.variables.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">Prompt này không dùng biến.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-slate-500">Bấm để chèn vào vị trí con trỏ. Biến có dấu * là bắt buộc phải có trong prompt.</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {prompt.variables.map((v) => {
                const required = prompt.required.includes(v);
                const used = text.includes(placeholder(v));
                return (
                  <li key={v}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => insertVariable(v)}
                      className={`rounded-full border px-3 py-1.5 font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 disabled:opacity-60 ${
                        required && !used ? "border-red-300 bg-red-50 text-red-700" : used ? "border-green-200 bg-green-50 text-green-700" : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {placeholder(v)}
                      {required && <span aria-label="bắt buộc"> *</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {missing.length > 0 && <p className="mt-2 text-sm font-semibold text-red-600">Đang thiếu biến bắt buộc: {missing.map(placeholder).join(", ")}.</p>}
      </div>

      {notice && (
        <div className="mt-4">
          <Notice type={notice.type}>{notice.text}</Notice>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400">{prompt.updated_at ? `Cập nhật ${formatDate(new Date(prompt.updated_at))}` : "Chưa chỉnh sửa lần nào"}</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" leftIcon={<RotateCcw />} disabled={busy || (prompt.is_default && !dirty)} onClick={() => setConfirm("reset")}>
            Khôi phục mặc định
          </Button>
          <Button leftIcon={<Save />} loading={save.isPending} disabled={!dirty || invalid || busy} onClick={() => setConfirm("save")}>
            Lưu
          </Button>
        </div>
      </div>

      <Modal open={confirm === "save"} onClose={() => setConfirm(null)} title="Lưu prompt này?" description={`Prompt “${promptLabel(prompt.key)}” sẽ được áp dụng cho các lần gọi AI tiếp theo.`}>
        <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Thay đổi prompt có thể làm AI trả kết quả sai định dạng JSON và gây lỗi chấm bài hoặc sinh bài. Hãy giữ đủ các biến bắt buộc {"{{…}}"} và đừng sửa phần yêu cầu định dạng đầu ra.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Hủy
          </Button>
          <Button onClick={() => void doSave()}>Lưu prompt</Button>
        </div>
      </Modal>

      <Modal open={confirm === "reset"} onClose={() => setConfirm(null)} title="Khôi phục prompt mặc định?" description={`Nội dung hiện tại của “${promptLabel(prompt.key)}” sẽ bị thay bằng bản mặc định${dirty ? ", kể cả các thay đổi chưa lưu" : ""}.`}>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Hủy
          </Button>
          <Button variant="danger" onClick={() => void doReset()}>
            Khôi phục
          </Button>
        </div>
      </Modal>
    </section>
  );
}
