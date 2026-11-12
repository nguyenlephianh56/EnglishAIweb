import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_LOG_INVALID_CODE, aiUsageLogEntrySchema, logAiUsage } from "./ai.log";
import { AI_TASKS, AI_USAGE_STATUSES } from "./ai.types";
import type { AiUsageLogEntry, AiUsageLogger } from "./ai.types";

function fakeLogger() {
  const rows: unknown[] = [];
  const logger: AiUsageLogger = { log: async (e) => void rows.push(e) };
  return { logger, rows };
}
const entry = (o: Partial<AiUsageLogEntry> = {}): AiUsageLogEntry => ({
  userId: 1, task: "generate", status: "ok", tokens: 20, ...o,
});

afterEach(() => vi.restoreAllMocks());

describe("logAiUsage", () => {
  it("mọi task x status hợp lệ -> ghi đúng 1 dòng", async () => {
    for (const task of AI_TASKS) for (const status of AI_USAGE_STATUSES) {
      const { logger, rows } = fakeLogger();
      expect(await logAiUsage(logger, entry({ task, status }))).toBe(true);
      expect(rows).toEqual([{ userId: 1, task, status, tokens: 20 }]);
    }
  });

  it("tokens null được ghi nguyên là null", async () => {
    const { logger, rows } = fakeLogger();
    await logAiUsage(logger, entry({ tokens: null }));
    expect(rows).toEqual([{ userId: 1, task: "generate", status: "ok", tokens: null }]);
  });

  it("task ngoài danh sách -> không ghi, console chỉ có tên field", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, rows } = fakeLogger();
    const ok = await logAiUsage(logger, entry({ task: "hack-SECRET" as never }));
    expect(ok).toBe(false);
    expect(rows).toHaveLength(0);
    const out = err.mock.calls.flat().join(" ");
    expect(out).toContain(AI_LOG_INVALID_CODE);
    expect(out).toContain("task");
    expect(out).not.toContain("SECRET");
  });

  it("status ngoài danh sách -> không ghi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, rows } = fakeLogger();
    expect(await logAiUsage(logger, entry({ status: "OK" as never }))).toBe(false);
    expect(await logAiUsage(logger, entry({ status: "failed" as never }))).toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("userId / tokens sai (0, âm, thập phân, NaN, chuỗi) -> không ghi", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger, rows } = fakeLogger();
    for (const bad of [{ userId: 0 }, { userId: -1 }, { userId: 1.5 }, { tokens: -1 }, { tokens: 1.5 }, { tokens: NaN }, { tokens: "9" as never }]) {
      expect(await logAiUsage(logger, entry(bad))).toBe(false);
    }
    expect(rows).toHaveLength(0);
  });

  it("trường thừa (prompt, bài làm...) bị bỏ, cổng chỉ nhận 4 trường", async () => {
    const { logger, rows } = fakeLogger();
    await logAiUsage(logger, { ...entry(), prompt: "BÀI LÀM", raw: "PHẢN HỒI" } as never);
    expect(Object.keys(rows[0] as object).sort()).toEqual(["status", "task", "tokens", "userId"]);
  });

  it("cổng ghi lỗi -> không ném, trả false, console chỉ có task/status/mã lỗi", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger: AiUsageLogger = {
      log: async () => { throw Object.assign(new Error("password=abc host=db"), { code: "P1001" }); },
    };
    await expect(logAiUsage(logger, entry())).resolves.toBe(false);
    const out = err.mock.calls.flat().join(" ");
    expect(out).toContain("task=generate status=ok code=P1001");
    expect(out).not.toContain("password");
  });

  it("không retry khi ghi lỗi (cổng chỉ bị gọi 1 lần)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.fn().mockRejectedValue(new Error("x"));
    await logAiUsage({ log }, entry());
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("schema export dùng được riêng", () => {
    expect(aiUsageLogEntrySchema.safeParse(entry()).success).toBe(true);
    expect(aiUsageLogEntrySchema.safeParse(entry({ status: "x" as never })).success).toBe(false);
  });
});