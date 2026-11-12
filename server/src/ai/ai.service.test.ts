import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// ai.usage.ts import prisma, ai.service.defaults import env/Gemini/Prisma: mock cả hai
// để test không cần DB, .env hay API thật.
vi.mock("../config/prisma", () => ({ prisma: {} }));
vi.mock("./ai.service.defaults", () => ({ getDefaultAiDeps: vi.fn() }));

import { buildAiCacheKey, DEFAULT_CACHEABLE_TASKS, InMemoryAiCache } from "./ai.cache";
import { AI_INVALID_TASK_CODE, runAiTask } from "./ai.service";
import { getDefaultAiDeps } from "./ai.service.defaults";
import type { AiServiceDeps } from "./ai.service";
import { AIQuotaExceededError } from "./ai.types";
import type { AiTask } from "./ai.types";
import { createPrismaUsageCounter, createPrismaUsageLogger } from "./ai.usage";
import type { AiRole, AiUsageDb } from "./ai.usage";
import { AIInvalidFormatError } from "./json";
import { AIProviderError } from "./provider";
import type { AIProvider, AIRequest, AIResponse } from "./provider";
import { AIServiceError, withResilience } from "./resilience";

const schema = z.object({ score: z.number(), comment: z.string() });
const VALID = JSON.stringify({ score: 7, comment: "Tốt" });
const SECRET_PROMPT = "BÀI LÀM BÍ MẬT: I goes to school every days.";
const SECRET_RAW = "PHẢN_HỒI_THÔ_RÒ_RỈ";
const MODEL = "mock-model";
// ---------------------------------------------------------------------
// Dựng môi trường giả
// ---------------------------------------------------------------------
type Step = string | Error | AIResponse;

function setup(
  options: {
    steps?: Step[]; // kịch bản provider; hết kịch bản thì trả VALID
    limits?: { student: number; teacher: number };
    startAt?: string;
    rawProvider?: AIProvider; // provider tự dựng (vd để bọc withResilience)
  } = {}
) {
  let current = new Date(options.startAt ?? "2026-11-12T03:00:00Z"); // 10:00 VN
  const clock = {
    now: () => current,
    set: (iso: string) => void (current = new Date(iso)),
  };

  // DB giả có lọc where giống Prisma; mỗi dòng log mang giờ của đồng hồ giả.
  const rows: { userId: number; task: string; status: string; tokens: number | null; createdAt: Date }[] = [];
  const db: AiUsageDb = {
    aiUsageLog: {
      async count({ where }) {
        return rows.filter(
          (r) =>
            r.userId === where.userId &&
            where.status.in.includes(r.status) &&
            r.createdAt >= where.createdAt.gte &&
            r.createdAt < where.createdAt.lt
        ).length;
      },
      async create({ data }) {
        rows.push({ ...data, createdAt: clock.now() });
        return data;
      },
    },
  };

  const steps = [...(options.steps ?? [])];
  const generate = vi.fn(async (_req: AIRequest): Promise<AIResponse> => {
    const step = steps.shift();
    if (step instanceof Error) throw step;
    if (step !== undefined && typeof step !== "string") return step;
    return { text: step ?? VALID, model: "mock-1", tokens: { input: 10, output: 5 } };
  });
  const provider: AIProvider = options.rawProvider ?? { name: "mock", generate };

  const cache = new InMemoryAiCache({ now: () => clock.now().getTime() });
  const deps: AiServiceDeps = {
    provider,
    cache,
    counter: createPrismaUsageCounter(db),
    logger: createPrismaUsageLogger(db),
    limits: options.limits ?? { student: 3, teacher: 5 },
    model: MODEL,
    cacheableTasks: new Set(DEFAULT_CACHEABLE_TASKS),
    now: clock.now,
  };

  const run = (
    over: Partial<{ userId: number; role: AiRole; task: AiTask; prompt: string }> = {},
    depsOver: Partial<AiServiceDeps> = {}
  ) =>
    runAiTask(
      { userId: 1, role: "STUDENT", task: "grade_writing", prompt: "p1", schema, ...over },
      { ...deps, ...depsOver }
    );

  const statuses = () => rows.map((r) => r.status);
  return { run, rows, statuses, generate, cache, deps, clock, db };
}

async function getError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Mong đợi lỗi nhưng lời gọi đã thành công");
}

let consoleSpies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  consoleSpies = (["log", "info", "warn", "error"] as const).map((m) =>
    vi.spyOn(console, m).mockImplementation(() => {})
  );
});
afterEach(() => vi.restoreAllMocks());

const consoleText = () =>
  consoleSpies.flatMap((s) => s.mock.calls.map((c) => c.map(String).join(" "))).join("\n");

// ---------------------------------------------------------------------
// Đường chính: miss -> ok, hit -> cached
// ---------------------------------------------------------------------
describe("runAiTask - cache miss rồi cache hit", () => {
  it("còn lượt + miss + hợp lệ -> {cached:false}, gọi provider 1 lần, lưu cache, log ok kèm tokens", async () => {
    const t = setup();
    const result = await t.run();

    expect(result).toEqual({ data: { score: 7, comment: "Tốt" }, cached: false });
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(await t.cache.get(buildAiCacheKey("grade_writing", MODEL, "p1"))).toEqual({ score: 7, comment: "Tốt" });
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toMatchObject({ userId: 1, task: "grade_writing", status: "ok", tokens: 15 });
  });

  it("gọi lần 2 cùng task+prompt -> {cached:true}, provider KHÔNG gọi thêm, log cached, không tính lượt", async () => {
    const t = setup();
    await t.run();
    const second = await t.run();

    expect(second).toEqual({ data: { score: 7, comment: "Tốt" }, cached: true });
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(["ok", "cached"]);
    expect(t.rows[1].tokens).toBeNull();
    expect(await t.deps.counter.countUsedToday(1, t.clock.now())).toBe(1);
  });

  it("prompt chỉ khác khoảng trắng đầu/cuối -> vẫn trúng cache", async () => {
    const t = setup();
    await t.run({ prompt: "p1" });
    const r = await t.run({ prompt: "  p1 \n" });
    expect(r.cached).toBe(true);
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

    it("prompt chỉ khác khoảng trắng giữa chữ / kiểu xuống dòng -> vẫn trúng cache", async () => {
    const t = setup();
    await t.run({ prompt: "Dòng 1\nDòng 2" });
    const r = await t.run({ prompt: "Dòng   1 \r\nDòng\t2" });
    expect(r.cached).toBe(true);
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("đổi model (cùng task + prompt) -> không trúng cache, gọi provider lại", async () => {
    const t = setup();
    await t.run({ prompt: "p1" });
    const r = await t.run({ prompt: "p1" }, { model: "model-khac" });
    expect(r.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(2);
  });
  
    it("xóa toàn bộ cache -> yêu cầu giống hệt trước đó thành miss, gọi provider lại", async () => {
    const t = setup({ limits: { student: 10, teacher: 10 } }); // đủ lượt cho 4 lần gọi thật
    await t.run({ prompt: "p1" });
    await t.run({ prompt: "p2" });
    expect((await t.run({ prompt: "p1" })).cached).toBe(true);

    await t.cache.clear();

    expect((await t.run({ prompt: "p1" })).cached).toBe(false);
    expect((await t.run({ prompt: "p2" })).cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(4);
  });

  it("khác task hoặc khác prompt -> khóa khác, gọi provider lại", async () => {
    const t = setup({ limits: { student: 10, teacher: 10 } });
    await t.run({ task: "grade_writing", prompt: "p1" });
    const diffTask = await t.run({ task: "grade_speaking", prompt: "p1" });
    const diffPrompt = await t.run({ task: "grade_writing", prompt: "p2" });

    expect(diffTask.cached).toBe(false);
    expect(diffPrompt.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(3);
    expect(t.statuses()).toEqual(["ok", "ok", "ok"]);
    expect(t.cache.size).toBe(3);
  });

  it("sửa data trả về không làm hỏng cache", async () => {
    const t = setup();
    const first = await t.run();
    first.data.comment = "ĐÃ BỊ SỬA";
    const second = await t.run();
    expect(second.data.comment).toBe("Tốt");
  });

  it("không báo token -> tokens = null; có thử lại định dạng -> cộng token cả 2 lần", async () => {
    const noTokens = setup({ steps: [{ text: VALID, model: "m" }] });
    await noTokens.run();
    expect(noTokens.rows[0].tokens).toBeNull();

    const retried = setup({
      steps: [
        { text: "không phải json", model: "m", tokens: { input: 10, output: 5 } },
        { text: VALID, model: "m", tokens: { input: 10, output: 5 } },
      ],
    });
    await retried.run();
    expect(retried.generate).toHaveBeenCalledTimes(2);
    expect(retried.rows).toHaveLength(1); // 1 lượt = 1 dòng log dù gọi model 2 lần
    expect(retried.rows[0]).toMatchObject({ status: "ok", tokens: 30 });
  });

  it("cache có dữ liệu sai khuôn so với schema lượt này -> coi như không trúng, gọi lại", async () => {
    const t = setup();
    await t.cache.set(buildAiCacheKey("grade_writing", MODEL, "p1"), { score: "không phải số" });
    const r = await t.run();
    expect(r.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(["ok"]);
  });
});

// ---------------------------------------------------------------------
// Giới hạn lượt
// ---------------------------------------------------------------------
describe("runAiTask - giới hạn lượt/ngày", () => {
  it("sát biên N=3: lượt 1-3 qua, lượt 4 bị chặn AI_QUOTA_EXCEEDED, không gọi model, log rate_limited", async () => {
    const t = setup({ limits: { student: 3, teacher: 5 } });
    await t.run({ prompt: "p1" });
    await t.run({ prompt: "p2" }); // lượt N-1 qua
    await t.run({ prompt: "p3" }); // lượt N vẫn qua
    expect(t.generate).toHaveBeenCalledTimes(3);

    const err = await getError(t.run({ prompt: "p4" }));
    expect(err).toBeInstanceOf(AIQuotaExceededError);
    expect(err).toMatchObject({ code: "AI_QUOTA_EXCEEDED", statusCode: 429 });
    expect((err as Error).message).toMatch(/hết lượt/);
    expect(t.generate).toHaveBeenCalledTimes(3); // provider KHÔNG gọi thêm
    expect(t.statuses()).toEqual(["ok", "ok", "ok", "rate_limited"]);
  });

  it("hết lượt: KHÔNG đụng cache, kể cả khi prompt đã có trong cache", async () => {
    const t = setup({ limits: { student: 1, teacher: 5 } });
    await t.run({ prompt: "p1" }); // dùng hết lượt, p1 đã vào cache
    const getSpy = vi.spyOn(t.cache, "get");
    const setSpy = vi.spyOn(t.cache, "set");

    const err = await getError(t.run({ prompt: "p1" }));
    expect(err).toBeInstanceOf(AIQuotaExceededError);
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("cached và rate_limited không làm giảm lượt; sang 00:00 giờ VN thì đếm lại từ 0", async () => {
    const t = setup({ startAt: "2026-11-12T16:00:00Z", limits: { student: 3, teacher: 5 } }); // 23:00 VN
    await t.run({ prompt: "p1" }); // ok (1)
    await t.run({ prompt: "p1" }); // cached: không tính
    await t.run({ prompt: "p2" }); // ok (2)
    await t.run({ prompt: "p3" }); // ok (3) -> nếu cached bị tính thì lượt này đã bị chặn
    expect(await getError(t.run({ prompt: "p4" }))).toBeInstanceOf(AIQuotaExceededError);
    expect(await getError(t.run({ prompt: "p4" }))).toBeInstanceOf(AIQuotaExceededError);
    // rate_limited không tính: vẫn đúng 3 lượt đã dùng
    expect(await t.deps.counter.countUsedToday(1, t.clock.now())).toBe(3);

    t.clock.set("2026-11-12T16:59:59.999Z"); // còn 1ms nữa là sang ngày
    expect(await getError(t.run({ prompt: "p4" }))).toBeInstanceOf(AIQuotaExceededError);

    t.clock.set("2026-11-12T17:00:00.000Z"); // đúng 00:00 giờ VN ngày 13/11
    expect(await t.deps.counter.countUsedToday(1, t.clock.now())).toBe(0);
    const r = await t.run({ prompt: "p4" });
    expect(r.cached).toBe(false);

    expect(t.generate).toHaveBeenCalledTimes(4); // p1,p2,p3 + p4 ngày mới
    // Mỗi lần gọi runAiTask ghi đúng 1 dòng log: 8 lần gọi -> 8 dòng.
    expect(t.statuses()).toEqual([
      "ok", "cached", "ok", "ok", "rate_limited", "rate_limited", "rate_limited", "ok",
    ]);
  });

  it("user A hết lượt không ảnh hưởng user B", async () => {
    const t = setup({ limits: { student: 1, teacher: 5 } });
    await t.run({ userId: 1, prompt: "pA" });
    expect(await getError(t.run({ userId: 1, prompt: "pA2" }))).toBeInstanceOf(AIQuotaExceededError);

    const b = await t.run({ userId: 2, prompt: "pB" });
    expect(b.cached).toBe(false);
    expect(t.rows.filter((r) => r.userId === 2).map((r) => r.status)).toEqual(["ok"]);
  });

  it("giới hạn theo vai trò: STUDENT mức học sinh, TEACHER và ADMIN mức giáo viên", async () => {
    const limits = { student: 2, teacher: 4 };
    const student = setup({ limits });
    await student.run({ prompt: "a" });
    await student.run({ prompt: "b" });
    expect(await getError(student.run({ prompt: "c" }))).toBeInstanceOf(AIQuotaExceededError);

    for (const role of ["TEACHER", "ADMIN"] as const) {
      const t = setup({ limits });
      for (const p of ["a", "b", "c", "d"]) await t.run({ role, prompt: p });
      expect(await getError(t.run({ role, prompt: "e" }))).toBeInstanceOf(AIQuotaExceededError);
      expect(t.generate).toHaveBeenCalledTimes(4);
    }
  });

  it("giới hạn 0 -> chặn ngay lượt đầu", async () => {
    const t = setup({ limits: { student: 0, teacher: 0 } });
    expect(await getError(t.run())).toBeInstanceOf(AIQuotaExceededError);
    expect(t.generate).not.toHaveBeenCalled();
    expect(t.statuses()).toEqual(["rate_limited"]);
  });
});

// ---------------------------------------------------------------------
// Lỗi khi gọi AI
// ---------------------------------------------------------------------
describe("runAiTask - lỗi khi gọi AI", () => {
  it("sai định dạng sau retry -> AI_INVALID_FORMAT, log error, KHÔNG lưu cache, lần sau gọi lại bình thường", async () => {
    const t = setup({ steps: ["không phải json", "vẫn không phải json"] });
    const err = await getError(t.run());

    expect(err).toBeInstanceOf(AIInvalidFormatError);
    expect(err).toMatchObject({ code: "AI_INVALID_FORMAT", statusCode: 502 });
    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.statuses()).toEqual(["error"]);
    expect(t.cache.size).toBe(0);

    // Lỗi không bị cache: gọi lại cùng prompt phải đi gọi model và thành công.
    const again = await t.run();
    expect(again.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(3);
    expect(t.statuses()).toEqual(["error", "ok"]);
  });

  it("Gemini 429 hết lượt thử -> RATE_LIMITED, log rate_limited, không tính lượt, không cache", async () => {
    const raw: AIProvider = {
      name: "raw",
      generate: vi.fn(async () => {
        throw new AIProviderError("RATE_LIMITED", "giới hạn");
      }),
    };
    const wrapped = withResilience(raw, {
      retry429Max: 1, retry429DelayMs: 1, retryNetworkMax: 1, retryNetworkDelayMs: 1,
      sleep: async () => {},
    });
    const t = setup({ rawProvider: wrapped });

    const err = await getError(t.run());
    expect(err).toBeInstanceOf(AIServiceError);
    expect(err).toMatchObject({ code: "RATE_LIMITED", statusCode: 429 });
    expect(t.statuses()).toEqual(["rate_limited"]);
    expect(await t.deps.counter.countUsedToday(1, t.clock.now())).toBe(0);
    expect(t.cache.size).toBe(0);
    // Khác với hết lượt/ngày: mã lỗi riêng để FE phân biệt.
    expect((err as AIServiceError).code).not.toBe("AI_QUOTA_EXCEEDED");
  });

  it.each([
    ["TIMEOUT", "TIMEOUT", 504],
    ["NETWORK", "AI_UNAVAILABLE", 502],
    ["AUTH", "AI_ERROR", 502],
    ["UNKNOWN", "AI_ERROR", 502],
  ] as const)("provider lỗi %s -> %s, log error, không cache", async (kind, code, status) => {
    const raw: AIProvider = {
      name: "raw",
      generate: vi.fn(async () => {
        throw new AIProviderError(kind, "lỗi");
      }),
    };
    const wrapped = withResilience(raw, {
      retry429Max: 1, retry429DelayMs: 1, retryNetworkMax: 1, retryNetworkDelayMs: 1,
      sleep: async () => {},
    });
    const t = setup({ rawProvider: wrapped });

    const err = await getError(t.run());
    expect(err).toMatchObject({ code, statusCode: status });
    expect(t.statuses()).toEqual(["error"]);
    expect(t.cache.size).toBe(0);
  });

  it("lỗi của T8 được ném lại NGUYÊN VẸN (cùng object), kể cả AIProviderError INVALID_RESPONSE", async () => {
    const serviceErr = new AIServiceError("TIMEOUT", 1);
    const t1 = setup({ steps: [serviceErr] });
    expect(await getError(t1.run())).toBe(serviceErr);
    expect(t1.statuses()).toEqual(["error"]);

    const invalid = new AIProviderError("INVALID_RESPONSE", "AI trả rỗng");
    const t2 = setup({ steps: [invalid] });
    expect(await getError(t2.run())).toBe(invalid);
    expect(t2.statuses()).toEqual(["error"]);
  });

  it("lỗi AI vẫn tính vào lượt (status error)", async () => {
    const t = setup({ steps: [new AIServiceError("TIMEOUT", 1)] });
    await getError(t.run());
    expect(await t.deps.counter.countUsedToday(1, t.clock.now())).toBe(1);
  });
});

// ---------------------------------------------------------------------
// Độ bền: log/cache/đếm lỗi
// ---------------------------------------------------------------------
describe("runAiTask - cổng phụ bị lỗi", () => {
  const dbError = () => Object.assign(new Error("db down: CHI_TIET_NOI_BO"), { code: "P1001" });

  it("ghi log DB lỗi -> kết quả AI vẫn trả về; chỉ console mã lỗi, không nội dung", async () => {
    const t = setup();
    const logger = { log: vi.fn(async () => { throw dbError(); }) };
    const result = await t.run({}, { logger });

    expect(result).toEqual({ data: { score: 7, comment: "Tốt" }, cached: false });
    expect(consoleText()).toContain("log_failed");
    expect(consoleText()).toContain("P1001");
    expect(consoleText()).not.toContain("CHI_TIET_NOI_BO");
  });

  it("ghi log lỗi trong đường lỗi AI / hết lượt -> vẫn ném đúng lỗi gốc", async () => {
    const failingLogger = { log: vi.fn(async () => { throw dbError(); }) };

    const bad = setup({ steps: ["x", "y"] });
    expect(await getError(bad.run({}, { logger: failingLogger }))).toBeInstanceOf(AIInvalidFormatError);

    const full = setup({ limits: { student: 0, teacher: 0 } });
    expect(await getError(full.run({}, { logger: failingLogger }))).toBeInstanceOf(AIQuotaExceededError);
  });

  it("cache.get lỗi -> coi như không trúng, vẫn gọi AI; cache.set lỗi -> vẫn trả kết quả", async () => {
    const t = setup();
       const cache = {
      get: vi.fn(async () => { throw dbError(); }),
      set: vi.fn(async () => { throw dbError(); }),
      clear: vi.fn(async () => {}),
    };
    const result = await t.run({}, { cache });

    expect(result.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(["ok"]);
    expect(consoleText()).toContain("cache_get_failed");
    expect(consoleText()).toContain("cache_set_failed");
    expect(consoleText()).not.toContain("CHI_TIET_NOI_BO");
  });

  it("không đếm được lượt (DB lỗi) -> ném lỗi lên, không gọi model (không thể xác nhận còn lượt)", async () => {
    const t = setup();
    const counter = { countUsedToday: vi.fn(async () => { throw dbError(); }) };
    expect(await getError(t.run({}, { counter }))).toMatchObject({ code: "P1001" });
    expect(t.generate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Task nào được cache
// ---------------------------------------------------------------------
describe("runAiTask - chỉ task trong danh sách mới dùng cache", () => {
  it.each(["grade_writing", "grade_speaking", "analysis", "path"] as const)(
    "%s: lần 2 cùng yêu cầu -> cached:true, provider không gọi thêm",
    async (task) => {
      const t = setup();
      const first = await t.run({ task });
      const second = await t.run({ task });
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(true);
      expect(t.generate).toHaveBeenCalledTimes(1);
      expect(t.statuses()).toEqual(["ok", "cached"]);
    }
  );

  it("generate: luôn gọi provider, không lưu cache (cùng tham số vẫn ra bài khác nhau)", async () => {
    const t = setup({ steps: [VALID, JSON.stringify({ score: 9, comment: "Bài khác" })] });
    const first = await t.run({ task: "generate" });
    const second = await t.run({ task: "generate" });

    expect(first).toEqual({ data: { score: 7, comment: "Tốt" }, cached: false });
    expect(second).toEqual({ data: { score: 9, comment: "Bài khác" }, cached: false });
    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.cache.size).toBe(0);
    expect(t.statuses()).toEqual(["ok", "ok"]);
  });

  it("generate không đọc cũng không ghi cache (kể cả khi cache có sẵn mục cùng khóa)", async () => {
    const t = setup();
    await t.cache.set(buildAiCacheKey("generate", MODEL, "p1"), { score: 1, comment: "cũ" });

    const cache = {
      get: vi.fn(t.cache.get.bind(t.cache)),
      set: vi.fn(t.cache.set.bind(t.cache)),
      clear: vi.fn(t.cache.clear.bind(t.cache)),
    };
    const r = await t.run({ task: "generate" }, { cache });

    expect(r).toEqual({ data: { score: 7, comment: "Tốt" }, cached: false });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(t.generate).toHaveBeenCalledTimes(1);
  });

  it("danh sách tùy chỉnh: chỉ task trong danh sách mới được cache", async () => {
    const t = setup({ limits: { student: 10, teacher: 10 } });
    const cacheableTasks = new Set<AiTask>(["generate"]);
    await t.run({ task: "generate" }, { cacheableTasks });
    const hitGenerate = await t.run({ task: "generate" }, { cacheableTasks });
    await t.run({ task: "grade_writing" }, { cacheableTasks });
    const missWriting = await t.run({ task: "grade_writing" }, { cacheableTasks });

    expect(hitGenerate.cached).toBe(true);
    expect(missWriting.cached).toBe(false);
    expect(t.generate).toHaveBeenCalledTimes(3);
  });

  it("danh sách rỗng -> không task nào được cache", async () => {
    const t = setup({ limits: { student: 10, teacher: 10 } });
    const cacheableTasks = new Set<AiTask>();
    await t.run({}, { cacheableTasks });
    const second = await t.run({}, { cacheableTasks });
    expect(second.cached).toBe(false);

    expect(t.generate).toHaveBeenCalledTimes(2);
    expect(t.cache.size).toBe(0);
  });

  it("task cache được mà lỗi / sai định dạng -> không lưu cache, lần sau gọi lại provider", async () => {
    const t = setup({
      limits: { student: 10, teacher: 10 },
      steps: [new Error("mạng đứt"), "không phải JSON", "vẫn không phải JSON", "lại hỏng", VALID],
    });
    await getError(t.run());
    expect(t.cache.size).toBe(0);
    await getError(t.run());
    expect(t.cache.size).toBe(0);

    const ok = await t.run();
    expect(ok.cached).toBe(false);
    expect(t.cache.size).toBe(1);
  });
});

// ---------------------------------------------------------------------
// task ngoài danh sách
// ---------------------------------------------------------------------
describe("runAiTask - kiểm task bằng Zod", () => {
  it.each(["bogus", "", "GENERATE", "grade_writing ", undefined, 5, null])(
    "task %j bị từ chối TRƯỚC khi đụng bất kỳ cổng nào",
    async (task) => {
      const t = setup();
      const getSpy = vi.spyOn(t.cache, "get");
      const countSpy = vi.spyOn(t.deps.counter, "countUsedToday");
      const logSpy = vi.spyOn(t.deps.logger, "log");

      const err = await getError(t.run({ task: task as never }));
      expect(err).toMatchObject({ code: AI_INVALID_TASK_CODE, statusCode: 400 });
      expect(t.generate).not.toHaveBeenCalled();
      expect(getSpy).not.toHaveBeenCalled();
      expect(countSpy).not.toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(t.rows).toHaveLength(0);
    }
  );

  it("cả 5 task hợp lệ đều chạy được", async () => {
    const t = setup({ limits: { student: 10, teacher: 10 } });
    for (const task of ["grade_writing", "grade_speaking", "generate", "analysis", "path"] as const) {
      expect((await t.run({ task })).cached).toBe(false);
    }
    expect(t.rows.map((r) => r.task)).toEqual([
      "grade_writing", "grade_speaking", "generate", "analysis", "path",
    ]);
  });
});

// ---------------------------------------------------------------------
// Bảo mật: không lộ nội dung
// ---------------------------------------------------------------------
describe("runAiTask - không lộ key, prompt, bài làm, phản hồi thô", () => {
  const leaks = (text: string) =>
    ["BÀI LÀM BÍ MẬT", "goes to school", SECRET_RAW].filter((s) => text.includes(s));

  it("đường thành công: log DB, khóa cache và console không chứa prompt", async () => {
    const t = setup({ steps: [JSON.stringify({ score: 5, comment: "ổn" })] });
    const setSpy = vi.spyOn(t.cache, "set");
    await t.run({ prompt: SECRET_PROMPT });

    expect(leaks(JSON.stringify(t.rows))).toEqual([]);
    expect(Object.keys(t.rows[0]).sort()).toEqual(["createdAt", "status", "task", "tokens", "userId"]);
    const key = setSpy.mock.calls[0][0] as string;
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(leaks(key)).toEqual([]);
    expect(leaks(consoleText())).toEqual([]);
  });

  it("entry service đưa cho cổng log chỉ có đúng 4 trường (mọi đường: ok, cached, lỗi, hết lượt)", async () => {
    const entries: object[] = [];
    const logger = { log: vi.fn(async (e: object) => void entries.push(e)) };

    const ok = setup();
    await ok.run({ prompt: SECRET_PROMPT }, { logger });
    await ok.run({ prompt: SECRET_PROMPT }, { logger }); // cached
    const bad = setup({ steps: ["x", "y"] });
    await getError(bad.run({ prompt: SECRET_PROMPT }, { logger })); // error
    const full = setup({ limits: { student: 0, teacher: 0 } });
    await getError(full.run({ prompt: SECRET_PROMPT }, { logger })); // rate_limited

    expect(entries).toHaveLength(4);
    for (const e of entries) {
      expect(Object.keys(e).sort()).toEqual(["status", "task", "tokens", "userId"]);
      expect(leaks(JSON.stringify(e))).toEqual([]);
    }
  });

  it("đường lỗi định dạng: lỗi, log DB, console không chứa prompt hay phản hồi thô", async () => {
    const t = setup({ steps: [`${SECRET_RAW} không phải JSON`, `${SECRET_RAW} vẫn sai`] });
    const err = (await getError(t.run({ prompt: SECRET_PROMPT }))) as Error;

    expect(leaks(err.message + JSON.stringify(err))).toEqual([]);
    expect(leaks(JSON.stringify(t.rows))).toEqual([]);
    expect(leaks(consoleText())).toEqual([]);
  });

  it("đường hết lượt: lỗi, log DB, console không chứa prompt", async () => {
    const t = setup({ limits: { student: 0, teacher: 0 } });
    const err = (await getError(t.run({ prompt: SECRET_PROMPT }))) as Error;

    expect(leaks(err.message + JSON.stringify(err))).toEqual([]);
    expect(leaks(JSON.stringify(t.rows))).toEqual([]);
    expect(leaks(consoleText())).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// Nối cổng mặc định
// ---------------------------------------------------------------------
describe("runAiTask - cổng mặc định (nạp muộn)", () => {
  it("thiếu cổng -> lấy từ getDefaultAiDeps; truyền đủ cổng thì không nạp mặc định", async () => {
    const t = setup();
    const { now: _now, ...defaults } = t.deps;
    vi.mocked(getDefaultAiDeps).mockReturnValue(defaults);

    // Không truyền deps nào: dùng toàn bộ mặc định (cổng giả ở trên).
    const r = await runAiTask({ userId: 1, role: "STUDENT", task: "path", prompt: "x", schema });
    expect(r.cached).toBe(false);
    expect(getDefaultAiDeps).toHaveBeenCalledTimes(1);
    expect(t.statuses()).toEqual(["ok"]);

    vi.mocked(getDefaultAiDeps).mockClear();
    await t.run({ prompt: "y" }); // truyền đủ cổng
    expect(getDefaultAiDeps).not.toHaveBeenCalled();
  });
});