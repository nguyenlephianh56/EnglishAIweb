import { describe, expect, it } from "vitest";
import { AI_TASKS } from "./ai.types";
import {
  DEFAULT_CACHE_TTL_MS,
  InMemoryAiCache,
  buildAiCacheKey,
} from "./ai.cache";

describe("buildAiCacheKey", () => {
  it("cùng task + prompt -> cùng khóa (ổn định)", () => {
    expect(buildAiCacheKey("generate", "Viết bài A1")).toBe(
      buildAiCacheKey("generate", "Viết bài A1")
    );
  });

  it("là sha256 dạng hex 64 ký tự", () => {
    expect(buildAiCacheKey("path", "x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("trim đầu/cuối được bỏ qua", () => {
    expect(buildAiCacheKey("generate", "  Viết bài A1 \n")).toBe(
      buildAiCacheKey("generate", "Viết bài A1")
    );
  });

  it("khoảng trắng GIỮA chữ vẫn tính (chỉ chuẩn hóa bằng trim)", () => {
    expect(buildAiCacheKey("generate", "a b")).not.toBe(
      buildAiCacheKey("generate", "a  b")
    );
  });

  it("khác prompt -> khác khóa", () => {
    expect(buildAiCacheKey("generate", "A")).not.toBe(
      buildAiCacheKey("generate", "B")
    );
  });

  it("khác task, cùng prompt -> khác khóa; 5 task cho 5 khóa khác nhau", () => {
    const keys = new Set(AI_TASKS.map((t) => buildAiCacheKey(t, "cùng prompt")));
    expect(keys.size).toBe(AI_TASKS.length);
  });

  it("khóa không chứa prompt thô", () => {
    const secret = "Bài làm riêng tư của học sinh Nguyễn Văn A";
    const key = buildAiCacheKey("grade_writing", secret);
    expect(key).not.toContain("Nguyễn");
    expect(key).not.toContain("học sinh");
  });
});

describe("InMemoryAiCache", () => {
  /** Đồng hồ giả: test tự tua thời gian. */
  const clock = (start = 1_000_000) => {
    let t = start;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };

  it("chưa lưu -> undefined", async () => {
    expect(await new InMemoryAiCache().get("k")).toBeUndefined();
  });

  it("lưu rồi lấy lại đúng giá trị", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("k", { score: 7, comment: "Tốt" });
    expect(await cache.get("k")).toEqual({ score: 7, comment: "Tốt" });
  });

  it("các khóa độc lập với nhau", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("a", 1);
    await cache.set("b", 2);
    expect(await cache.get("a")).toBe(1);
    expect(await cache.get("b")).toBe(2);
  });

  it("còn hạn thì hit, ĐÚNG lúc hết hạn thì miss và bị dọn", async () => {
    const c = clock();
    const cache = new InMemoryAiCache({ ttlMs: 1000, now: c.now });
    await cache.set("k", "v");

    c.advance(999);
    expect(await cache.get("k")).toBe("v");

    c.advance(1); // đủ 1000ms
    expect(await cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("TTL mặc định là 24 giờ", async () => {
    const c = clock();
    const cache = new InMemoryAiCache({ now: c.now });
    await cache.set("k", "v");

    c.advance(DEFAULT_CACHE_TTL_MS - 1);
    expect(await cache.get("k")).toBe("v");
    c.advance(1);
    expect(await cache.get("k")).toBeUndefined();
  });

  it("lưu đè -> đặt lại hạn và dùng giá trị mới", async () => {
    const c = clock();
    const cache = new InMemoryAiCache({ ttlMs: 1000, now: c.now });
    await cache.set("k", "cũ");
    c.advance(800);
    await cache.set("k", "mới");
    c.advance(800); // tổng 1600ms từ lần đầu, nhưng mới 800ms từ lần lưu đè
    expect(await cache.get("k")).toBe("mới");
  });

  it("sửa object trả về KHÔNG làm hỏng dữ liệu trong cache", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("k", { errors: [{ type: "vocab" }] });

    const first = (await cache.get("k")) as { errors: unknown[] };
    first.errors.push({ type: "hỏng" });

    expect(await cache.get("k")).toEqual({ errors: [{ type: "vocab" }] });
  });

  it("sửa object gốc SAU khi lưu KHÔNG làm hỏng cache", async () => {
    const cache = new InMemoryAiCache();
    const original = { comment: "Tốt" };
    await cache.set("k", original);
    original.comment = "đã bị sửa";
    expect(await cache.get("k")).toEqual({ comment: "Tốt" });
  });

  it("không lưu undefined (vẫn là miss)", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("k", undefined);
    expect(await cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("lưu được giá trị 'falsy' hợp lệ (0, chuỗi rỗng, false, null)", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("zero", 0);
    await cache.set("empty", "");
    await cache.set("no", false);
    await cache.set("nil", null);
    expect(await cache.get("zero")).toBe(0);
    expect(await cache.get("empty")).toBe("");
    expect(await cache.get("no")).toBe(false);
    expect(await cache.get("nil")).toBeNull();
  });
});