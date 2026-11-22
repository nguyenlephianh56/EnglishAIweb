import type { Request, Response } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { InMemoryAiCache } from "../../ai/ai.cache";
import { runAiTask } from "../../ai/ai.service";
import { AIQuotaExceededError, type AiTask } from "../../ai/ai.types";
import { createAiDailyLimitsReader, getAiDailyLimitsConfig } from "../../ai/ai.usage.settings";
import { aiRateLimit } from "../../middlewares/aiRateLimit";
import { updateAdminAiLimits } from "./admin.ai-limits.service";
import { createPromptTestDb } from "./admin.prompts-db-fixture";

let reader: ReturnType<typeof createAiDailyLimitsReader>;
vi.mock("../../ai/ai.usage.settings", async (importOriginal) => {
  const settings = await importOriginal<typeof import("../../ai/ai.usage.settings")>();
  // Router và runAiTask đọc chung từ PostgreSQL tạm qua bộ đọc thật.
  return {
    ...settings,
    getAiDailyLimitsConfig: vi.fn(() => reader.getAiDailyLimitsConfig()),
    invalidateAiDailyLimitsCache: () => reader.invalidateAiDailyLimitsCache(),
  };
});

const adminId = 42;
let db: Awaited<ReturnType<typeof createPromptTestDb>>;

beforeAll(async () => {
  db = await createPromptTestDb(adminId);
});

beforeEach(async () => {
  await db.$transaction([db.auditLog.deleteMany(), db.promptTemplate.deleteMany()]);
  reader = createAiDailyLimitsReader(db, () => 0);
  vi.mocked(getAiDailyLimitsConfig).mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db?.$disconnect();
});

function aiPorts() {
  const counter = { countUsedToday: vi.fn().mockResolvedValue(5) };
  const logger = { log: vi.fn().mockResolvedValue(undefined) };
  const generate = vi.fn().mockResolvedValue({ text: '{"ok":true}', model: "test-model" });
  const deps = {
    counter,
    logger,
    provider: { name: "test", generate },
    cache: new InMemoryAiCache(),
    model: "test-model",
    cacheableTasks: new Set<AiTask>(),
  };
  return { deps, counter, logger, generate };
}

const input = { userId: 7, role: "STUDENT", task: "generate", prompt: "fixture", schema: z.object({ ok: z.boolean() }) } as const;

describe("áp dụng hạn mức DB trong hai luồng gọi AI", () => {
  it.each([
    ["STUDENT", "student"], ["TEACHER", "teacher"], ["ADMIN", "teacher"],
  ] as const)("%s dùng mức %s và thấy ngay giá trị mới sau lần ghi", async (role, limitKey) => {
    const { deps, counter, logger, generate } = aiPorts();
    const middleware = aiRateLimit("generate", { counter, logger });
    const req = { user: { id: input.userId, role, status: "ACTIVE" } } as Request;
    const res = { locals: { getAiDailyLimits: getAiDailyLimitsConfig } } as unknown as Response;
    const next = vi.fn();
    const initial = { student: 9, teacher: 9, [limitKey]: 5 };
    await updateAdminAiLimits(adminId, initial, db);

    await middleware(req, res, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(expect.any(AIQuotaExceededError));
    await expect(runAiTask({ ...input, role }, deps)).rejects.toBeInstanceOf(AIQuotaExceededError);
    expect(generate).not.toHaveBeenCalled();

    await updateAdminAiLimits(adminId, { ...initial, [limitKey]: 6 }, db);
    next.mockClear();
    await middleware(req, res, next);
    expect(next.mock.calls).toEqual([[]]);
    await expect(runAiTask({ ...input, role }, deps)).resolves.toEqual({ data: { ok: true }, cached: false });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(logger.log.mock.calls.map(([entry]) => entry.status)).toEqual(["rate_limited", "rate_limited", "ok"]);
  });

  it("getLimits được truyền riêng cho middleware có ưu tiên hơn cấu hình router", async () => {
    const { counter, logger } = aiPorts();
    const getLimits = vi.fn().mockResolvedValue({ student: 6, teacher: 6 });
    const middleware = aiRateLimit("generate", { counter, logger, getLimits });
    const req = { user: { id: input.userId, role: "STUDENT", status: "ACTIVE" } } as Request;
    const res = { locals: { getAiDailyLimits: getAiDailyLimitsConfig } } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next.mock.calls).toEqual([[]]);
    expect(getLimits).toHaveBeenCalledTimes(1);
    expect(getAiDailyLimitsConfig).not.toHaveBeenCalled();
  });

  it("giữ limits tĩnh đã truyền và ưu tiên getLimits khi caller truyền cả hai", async () => {
    const { deps, generate } = aiPorts();
    await updateAdminAiLimits(adminId, { student: 3, teacher: 3 }, db);
    const limits = { student: 8, teacher: 8 };
    await expect(runAiTask(input, { ...deps, model: undefined, limits })).resolves.toMatchObject({ data: { ok: true } });

    const getLimits = vi.fn().mockResolvedValue({ student: 5, teacher: 5 });
    await expect(runAiTask(input, { ...deps, limits, getLimits })).rejects.toBeInstanceOf(AIQuotaExceededError);
    await expect(runAiTask(input, { ...deps, getLimits })).rejects.toBeInstanceOf(AIQuotaExceededError);
    expect(getLimits).toHaveBeenCalledTimes(2);
    expect(getAiDailyLimitsConfig).not.toHaveBeenCalled();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("bước chấm Nói nối tiếp lượt đã kiểm tra không đọc hạn mức hoặc đếm lượt lần nữa", async () => {
    const { deps, counter, logger } = aiPorts();
    const speakingUsageContinuation = { log: vi.fn().mockResolvedValue(undefined) };
    await expect(runAiTask({ ...input, task: "grade_speaking", speakingUsageContinuation }, deps))
      .resolves.toMatchObject({ data: { ok: true } });
    expect(getAiDailyLimitsConfig).not.toHaveBeenCalled();
    expect(counter.countUsedToday).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(speakingUsageContinuation.log).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: "ok" }));
  });
});