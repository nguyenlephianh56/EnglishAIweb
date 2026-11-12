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
import { aiTaskSchema } from "./ai.types";
import type { AiCache, AiTask } from "./ai.types";

/** Hạn dùng mặc định của một mục cache: 24 giờ. */
export const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Số mục tối đa mặc định. */
export const DEFAULT_CACHE_MAX_ENTRIES = 500;
/** Task được cache mặc định. KHÔNG có `generate`: sinh bài cần mỗi lần một bài khác nhau. */
export const DEFAULT_CACHEABLE_TASKS: readonly AiTask[] = [
  "grade_writing",
  "grade_speaking",
  "analysis",
  "path",
];

/**
 * Đọc danh sách task cache được từ chuỗi cách nhau bằng dấu phẩy (giá trị AI_CACHE_TASKS).
 * Bỏ khoảng trắng thừa, bỏ mục rỗng, bỏ trùng. Tên không thuộc danh sách task bị bỏ qua và
 * chỉ được ĐẾM (`ignored`) để báo cấu hình sai, không đưa tên vào kết quả.
 */
export function parseCacheableTasks(raw: string): { tasks: Set<AiTask>; ignored: number } {
  const tasks = new Set<AiTask>();
  let ignored = 0;
  for (const part of raw.split(",")) {
    const name = part.trim();
    if (name === "") continue;
    const parsed = aiTaskSchema.safeParse(name);
    if (parsed.success) tasks.add(parsed.data);
    else ignored += 1;
  }
  return { tasks, ignored };
}
/**
 * Chuẩn hóa prompt để các prompt "giống nhau về nội dung" ra cùng khóa:
 *  1. xuống dòng \r\n hoặc \r -> \n
 *  2. các khoảng trắng liên tiếp TRONG MỘT DÒNG (dấu cách, tab, ...) -> 1 dấu cách
 *  3. bỏ dấu cách ở cuối dòng
 *  4. từ 3 dấu xuống dòng trở lên -> 2 (giữ ranh giới đoạn, vì bài Viết xuống đoạn
 *     hay không có thể ảnh hưởng điểm mạch lạc)
 *  5. trim đầu/cuối
 * KHÔNG đổi chữ hoa/thường (bài làm "Hello" và "hello" là hai bài khác nhau).
 */
export function normalizePrompt(prompt: string): string {
  return prompt
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ \n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


export function buildAiCacheKey(task: AiTask, model: string, prompt: string): string {
  return createHash("sha256")
    .update(JSON.stringify([task, model, normalizePrompt(prompt)]))
    .digest("hex");
}

export interface InMemoryAiCacheOptions {
  /** Hạn dùng (ms). Mặc định 24 giờ. Không phải số > 0 (vd 0) thì TẮT cache. */
  ttlMs?: number;
  /** Số mục tối đa. Mặc định 500. Không phải số >= 1 (vd 0) thì TẮT cache. */
  maxEntries?: number;
  /** Đồng hồ (ms). Test truyền hàm giả để không phải chờ. Mặc định Date.now. */
  now?: () => number;
}

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class InMemoryAiCache implements AiCache {
  /**
   * Map giữ thứ tự theo lúc lưu: mục đầu tiên = mục lưu sớm nhất (cũ nhất).
   * TTL cố định nên mục cũ nhất cũng là mục sắp hết hạn nhất.
   */
  private readonly store = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly enabled: boolean;
  private readonly now: () => number;

  constructor(options: InMemoryAiCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = Math.floor(options.maxEntries ?? DEFAULT_CACHE_MAX_ENTRIES);
    this.enabled =
      Number.isFinite(this.ttlMs) &&
      this.ttlMs > 0 &&
      Number.isFinite(this.maxEntries) &&

      this.maxEntries >= 1;
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
    // (get không đổi thứ tự: "cũ nhất" nghĩa là lưu sớm nhất, không phải ít dùng nhất.)
    return structuredClone(entry.value);
  }

  /**
   * Lưu bản sao + đặt lại hạn. `undefined` bị bỏ qua (vì get trả undefined nghĩa là "không có").
   * Trước khi thêm: bỏ mục cùng khóa (để bản mới thành mới nhất), dọn mục đã hết hạn,
   * rồi nếu vẫn đầy thì đuổi mục cũ nhất cho tới khi còn chỗ. Cache tắt thì không lưu gì.
   */
  async set(key: string, value: unknown): Promise<void> {
    if (!this.enabled || value === undefined) return;

    this.store.delete(key);
    this.dropExpired();
    while (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);

    }

    this.store.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + this.ttlMs,
    });
  }

  /**
   * Xóa toàn bộ cache. Dùng cho test và (về sau) khi admin đổi prompt mẫu để kết quả cũ
   * không còn được dùng lại.
   */
  async clear(): Promise<void> {
    this.store.clear();
  }

  /** Số mục đang giữ (có thể gồm mục hết hạn chưa bị dọn). Chủ yếu để test. */
  get size(): number {
    return this.store.size;
  }

  /** Dọn các mục hết hạn từ đầu hàng; dừng ở mục đầu tiên còn hạn (các mục sau còn hạn hơn). */
  private dropExpired(): void {
    const t = this.now();
    for (const [k, entry] of this.store) {
      if (t < entry.expiresAt) break;
      this.store.delete(k);
    }
  }
}