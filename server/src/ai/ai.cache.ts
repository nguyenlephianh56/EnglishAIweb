// =====================================================================
// ai/ai.cache.ts — Cổng cache (AiCache) bản tối thiểu + hàm tạo khóa cache.
//
// - buildAiCacheKey: khóa = sha256(task + prompt đã trim). Khóa là chuỗi hex 64 ký tự,
//   KHÔNG chứa prompt thô (prompt có thể là bài làm của học sinh).
// - InMemoryAiCache: lưu trong RAM bằng Map, có hạn dùng (TTL). Mất khi restart server.
//
// Quy tắc (do ai.service.ts giữ, cache chỉ lưu những gì được đưa vào):
//   chỉ đưa vào kết quả ĐÃ qua Zod; không bao giờ đưa lỗi vào.
//
// TODO (việc sau của T9, chưa làm): tinh chỉnh TTL qua .env, giới hạn dung lượng
//   (hiện Map chỉ dọn mục hết hạn khi có người đọc đúng khóa đó), lưu bền (DB/Redis).
// =====================================================================
import { createHash } from "node:crypto";
import type { AiCache, AiTask } from "./ai.types";

/** Hạn dùng mặc định của một mục cache: 24 giờ. */
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Tạo khóa cache từ loại việc + prompt.
 * Chỉ chuẩn hóa bằng trim (bỏ khoảng trắng đầu/cuối); khoảng trắng giữa chữ giữ nguyên.
 * Dấu "\n" ngăn cách task và prompt; task thuộc danh sách cố định (không có "\n")
 * nên hai cặp (task, prompt) khác nhau không thể ra cùng chuỗi đầu vào.
 */
export function buildAiCacheKey(task: AiTask, prompt: string): string {
  return createHash("sha256").update(`${task}\n${prompt.trim()}`).digest("hex");
}

export interface InMemoryAiCacheOptions {
  /** Hạn dùng (ms). Mặc định 24 giờ. */
  ttlMs?: number;
  /** Đồng hồ (ms). Test truyền hàm giả để không phải chờ. Mặc định Date.now. */
  now?: () => number;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class InMemoryAiCache implements AiCache {
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryAiCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Không có hoặc đã hết hạn -> undefined (và xóa mục hết hạn). */
  async get(key: string): Promise<unknown | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Trả BẢN SAO: bên ngoài sửa kết quả sẽ không làm hỏng dữ liệu trong cache.
    return structuredClone(entry.value);
  }

  /** Lưu bản sao + đặt lại hạn. `undefined` bị bỏ qua (vì get trả undefined nghĩa là "không có"). */
  async set(key: string, value: unknown): Promise<void> {
    if (value === undefined) return;
    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + this.ttlMs,
    });
  }

  /** Số mục đang giữ (kể cả mục hết hạn chưa bị dọn). Chủ yếu để test. */
  get size(): number {
    return this.store.size;
  }
}