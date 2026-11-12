import { describe, expect, it } from "vitest";
import { AI_TASKS } from "./ai.types";
import {
  DEFAULT_CACHEABLE_TASKS,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
  InMemoryAiCache,
  buildAiCacheKey,
  normalizePrompt,
  parseCacheableTasks,
} from "./ai.cache";

const MODEL = "mock-model";
const key = (prompt: string, task: (typeof AI_TASKS)[number] = "grade_writing", model = MODEL) =>
  buildAiCacheKey(task, model, prompt);

describe("normalizePrompt", () => {
  it("\\r\\n và \\r được đổi thành \\n", () => {
    expect(normalizePrompt("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("gộp dấu cách/tab liên tiếp trong dòng thành 1 dấu cách", () => {
    expect(normalizePrompt("a   b\t\t c")).toBe("a b c");
  });

  it("bỏ dấu cách cuối dòng, trim đầu/cuối", () => {
    expect(normalizePrompt("  a  \n  b  \n")).toBe("a\n b");
  });

  it("từ 3 xuống dòng trở lên -> 2 (giữ ranh giới đoạn); 1 xuống dòng vẫn khác dấu cách", () => {
    expect(normalizePrompt("a\n\n\n\n\nb")).toBe("a\n\nb");
    expect(normalizePrompt("a\nb")).not.toBe(normalizePrompt("a b"));
    expect(normalizePrompt("a\n\nb")).not.toBe(normalizePrompt("a\nb"));
  });

  it("không đổi chữ hoa/thường", () => {
    expect(normalizePrompt("Hello World")).toBe("Hello World");
  });
});

describe("buildAiCacheKey", () => {
  it("cùng task + model + prompt -> cùng khóa (ổn định)", () => {
    expect(key("Viết bài A1")).toBe(key("Viết bài A1"));
  });

  it("là sha256 dạng hex 64 ký tự", () => {
    expect(key("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("khác đúng 1 ký tự -> khác khóa", () => {
    expect(key("I goes to school")).not.toBe(key("I goes to schoo1"));
    expect(key("A")).not.toBe(key("B"));
  });

  it("khác task, cùng model + prompt -> khác khóa; 5 task cho 5 khóa khác nhau", () => {
    const keys = new Set(AI_TASKS.map((t) => key("cùng prompt", t)));
    expect(keys.size).toBe(AI_TASKS.length);
  });

  it("khác model, cùng task + prompt -> khác khóa", () => {
    expect(key("p", "grade_writing", "model-a")).not.toBe(key("p", "grade_writing", "model-b"));
  });

  it("chỉ khác khoảng trắng thừa / kiểu xuống dòng -> cùng khóa", () => {
    const base = key("Dòng 1\nDòng 2\n\nĐoạn 2");
    expect(key("  Dòng 1\nDòng 2\n\nĐoạn 2 \n")).toBe(base);
    expect(key("Dòng  1 \r\nDòng\t2\r\n\r\n\r\n\r\nĐoạn   2")).toBe(base);
  });

  it("khác chữ hoa/thường -> khác khóa (không tự hạ chữ thường)", () => {
    expect(key("Hello")).not.toBe(key("hello"));
  });

  it("khác ranh giới đoạn -> khác khóa", () => {
    expect(key("a b")).not.toBe(key("a\nb"));
  });

  it("task/model/prompt không thể dính nhau thành cùng khóa", () => {
    expect(buildAiCacheKey("path", "m", "x")).not.toBe(buildAiCacheKey("path", "m\nx", ""));
  });

  it("khóa không chứa prompt thô", () => {
    const secret = "Bài làm riêng tư của học sinh Nguyễn Văn A";
    const k = key(secret);
    expect(k).not.toContain("Nguyễn");
    expect(k).not.toContain("học sinh");
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

describe("InMemoryAiCache - giới hạn số mục, đuổi mục cũ nhất", () => {
  const clock = (start = 1_000_000) => {
    let t = start;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };
  /** Lấy trạng thái trúng/trượt của danh sách khóa (get không đổi thứ tự nên đọc thoải mái). */
  const hits = async (cache: InMemoryAiCache, keys: string[]) =>
    Promise.all(keys.map(async (k) => (await cache.get(k)) !== undefined));

  it("trần mặc định là 500: lưu 501 mục -> còn 500, mục đầu bị đuổi", async () => {
    expect(DEFAULT_CACHE_MAX_ENTRIES).toBe(500);
    const cache = new InMemoryAiCache();
    for (let i = 0; i < 501; i++) await cache.set(`k${i}`, i);
    expect(cache.size).toBe(500);
    expect(await cache.get("k0")).toBeUndefined();
    expect(await cache.get("k1")).toBe(1);
    expect(await cache.get("k500")).toBe(500);
  });

  it("đủ MAX rồi thêm 1 -> mục cũ nhất bị đuổi, tổng không vượt trần", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 3 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);
    expect(cache.size).toBe(3);

    await cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(await hits(cache, ["a", "b", "c", "d"])).toEqual([false, true, true, true]);
  });


  it("lưu rất nhiều mục -> không bao giờ vượt trần, còn lại đúng các mục mới nhất", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 5 });
    for (let i = 0; i < 100; i++) {
      await cache.set(`k${i}`, i);
      expect(cache.size).toBeLessThanOrEqual(5);
    }
    const keys = Array.from({ length: 100 }, (_, i) => `k${i}`);
    const present = (await hits(cache, keys)).map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
    expect(present).toEqual([95, 96, 97, 98, 99]);
  });

  it("đọc (get) không làm mục 'mới hơn': vẫn đuổi mục lưu sớm nhất", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 2 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.get("a"); // đọc a nhiều lần
    await cache.get("a");
    await cache.set("c", 3);
    expect(await hits(cache, ["a", "b", "c"])).toEqual([false, true, true]);
  });

  it("lưu đè khóa đã có: không đuổi ai, và khóa đó trở thành mới nhất", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 3 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("c", 3);

    await cache.set("a", 10); // đầy nhưng là khóa đã có
    expect(cache.size).toBe(3);
    expect(await hits(cache, ["a", "b", "c"])).toEqual([true, true, true]);
    expect(await cache.get("a")).toBe(10);


    await cache.set("d", 4); // cũ nhất lúc này là b (a vừa được lưu lại)
    expect(await hits(cache, ["a", "b", "c", "d"])).toEqual([true, false, true, true]);
  });

  it("trần = 1: luôn chỉ giữ mục mới nhất", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 1 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    expect(cache.size).toBe(1);
    expect(await hits(cache, ["a", "b"])).toEqual([false, true]);
  });

  it("khi đầy mà có mục đã hết hạn: dọn mục hết hạn trước, không đuổi nhầm mục còn hạn", async () => {
    const c = clock();
    const cache = new InMemoryAiCache({ ttlMs: 1000, maxEntries: 3, now: c.now });
    await cache.set("a", 1); // hết hạn lúc +1000
    c.advance(600);
    await cache.set("b", 2); // hết hạn lúc +1600
    await cache.set("c", 3);
    c.advance(500); // a đã hết hạn (1100), b và c còn hạn

    await cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(await hits(cache, ["a", "b", "c", "d"])).toEqual([false, true, true, true]);
  });

  it("lưu mục mới cũng dọn các mục đã hết hạn (không để rác chiếm chỗ)", async () => {
    const c = clock();
    const cache = new InMemoryAiCache({ ttlMs: 1000, maxEntries: 10, now: c.now });
    await cache.set("a", 1);
    await cache.set("b", 2);
    expect(cache.size).toBe(2);


    c.advance(1000); // a và b hết hạn đúng lúc này
    await cache.set("c", 3);
    expect(cache.size).toBe(1);
    expect(await cache.get("c")).toBe(3);
  });

  it("sau khi bị đuổi, lưu lại cùng khóa thì dùng được bình thường", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 1 });
    await cache.set("a", 1);
    await cache.set("b", 2);
    await cache.set("a", 3);
    expect(await cache.get("a")).toBe(3);
    expect(await cache.get("b")).toBeUndefined();
  });
});

describe("InMemoryAiCache - xóa toàn bộ (clear)", () => {
  it("clear -> mọi khóa thành miss, size = 0", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("a", 1);
    await cache.set("b", { x: 1 });
    await cache.set("c", "v");

    await cache.clear();

    expect(cache.size).toBe(0);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("c")).toBeUndefined();
  });


  it("clear trên cache rỗng không lỗi; dùng lại được sau khi clear", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 2 });
    await cache.clear();
    await cache.set("a", 1);
    await cache.clear();
    await cache.set("b", 2);
    await cache.set("c", 3);
    await cache.set("d", 4);
    expect(cache.size).toBe(2);
    expect(await cache.get("a")).toBeUndefined();
    expect(await cache.get("d")).toBe(4);
  });
});

describe("InMemoryAiCache - tắt cache bằng cấu hình", () => {
  it.each([
    ["ttlMs = 0", { ttlMs: 0 }],
    ["maxEntries = 0", { maxEntries: 0 }],
    ["ttlMs âm", { ttlMs: -5 }],
    ["ttlMs = NaN", { ttlMs: Number.NaN }],
    ["maxEntries = NaN", { maxEntries: Number.NaN }],
    ["maxEntries < 1 (0.5)", { maxEntries: 0.5 }],
  ])("%s -> không lưu gì, luôn miss", async (_name, options) => {
    const cache = new InMemoryAiCache(options);
    await cache.set("a", 1);
    expect(cache.size).toBe(0);
    expect(await cache.get("a")).toBeUndefined();
  });

  it("maxEntries lẻ (2.9) được làm tròn xuống 2", async () => {
    const cache = new InMemoryAiCache({ maxEntries: 2.9 });
    await cache.set("a", 1);

    await cache.set("b", 2);
    await cache.set("c", 3);
    expect(cache.size).toBe(2);
  });

  it("không truyền gì -> bật với mặc định (24 giờ, 500 mục)", async () => {
    const cache = new InMemoryAiCache();
    await cache.set("a", 1);
    expect(await cache.get("a")).toBe(1);
  });
});

describe("danh sách task được cache", () => {
  it("mặc định gồm 4 task chấm/phân tích/lộ trình và KHÔNG có generate", () => {
    expect([...DEFAULT_CACHEABLE_TASKS].sort()).toEqual(
      ["analysis", "grade_speaking", "grade_writing", "path"]
    );
    expect(DEFAULT_CACHEABLE_TASKS).not.toContain("generate");
  });

  it("đọc chuỗi mặc định của .env ra đúng danh sách mặc định", () => {
    const { tasks, ignored } = parseCacheableTasks("grade_writing,grade_speaking,analysis,path");
    expect([...tasks].sort()).toEqual([...DEFAULT_CACHEABLE_TASKS].sort());
    expect(ignored).toBe(0);
  });

  it("bỏ khoảng trắng thừa, mục rỗng và mục trùng", () => {
    const { tasks, ignored } = parseCacheableTasks(" analysis , ,path,analysis,, ");
    expect([...tasks].sort()).toEqual(["analysis", "path"]);
    expect(ignored).toBe(0);
  });

  it("tên task sai (kể cả sai hoa/thường) bị bỏ qua và chỉ được đếm", () => {
    const { tasks, ignored } = parseCacheableTasks("analysis,bogus,PATH,grade_writing ");
    expect([...tasks].sort()).toEqual(["analysis", "grade_writing"]);
    expect(ignored).toBe(2);
  });

  it("chuỗi rỗng -> danh sách rỗng; có thể cache generate nếu được ghi rõ", () => {
    expect(parseCacheableTasks("").tasks.size).toBe(0);
    expect([...parseCacheableTasks("generate").tasks]).toEqual(["generate"]);
  });
});