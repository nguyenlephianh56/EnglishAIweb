import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "englishai:draft:";
const DEBOUNCE_MS = 800;

interface StoredDraft {
  text: string;
  savedAt: number;
}

/** Mọi thao tác localStorage bọc try/catch: bị chặn hoặc đầy bộ nhớ thì bỏ qua im lặng. */
function read(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<StoredDraft> | null;
    if (o && typeof o.text === "string" && o.text !== "" && typeof o.savedAt === "number") return { text: o.text, savedAt: o.savedAt };
  } catch {
    /* bỏ qua */
  }
  return null;
}
function write(key: string, text: string) {
  try {
    if (text.trim() === "") window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify({ text, savedAt: Date.now() } as StoredDraft));
  } catch {
    /* bỏ qua */
  }
}

/**
 * Tự lưu nháp bài Viết vào localStorage (khóa "englishai:draft:<id>"), chỉ lưu văn bản và thời điểm.
 * `initial`: bản nháp đọc được lúc mở trang (đọc một lần). `save(text)`: lưu sau 800ms ngừng gõ.
 * `clear()`: xóa nháp (gọi khi nộp thành công). Còn bản chưa kịp lưu thì ghi nốt khi rời trang.
 */
export function useWritingDraft(id: string, enabled: boolean) {
  const key = PREFIX + id;
  const [initial] = useState<StoredDraft | null>(() => (enabled ? read(key) : null));
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pending.current !== null) write(key, pending.current);
    pending.current = null;
  }, [key]);

  const save = useCallback(
    (text: string) => {
      if (!enabled) return;
      pending.current = text;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, DEBOUNCE_MS);
    },
    [enabled, flush]
  );

  const clear = useCallback(() => {
    window.clearTimeout(timer.current);
    pending.current = null;
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* bỏ qua */
    }
  }, [key]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  return { initial, save, clear };
}

/** "Đã khôi phục bản nháp lưu lúc HH:mm" */
export const formatDraftTime = (ms: number) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
