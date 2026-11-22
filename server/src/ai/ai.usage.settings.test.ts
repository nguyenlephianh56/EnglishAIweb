import { afterEach, describe, expect, it, vi } from "vitest";
import { AI_DAILY_LIMITS_KEY, aiDailyLimitsSchema, createAiDailyLimitsReader } from "./ai.usage.settings";

vi.mock("../config/env", () => ({ env: { AI_DAILY_LIMIT_STUDENT: 17, AI_DAILY_LIMIT_TEACHER: 61 } }));
vi.mock("../config/prisma", () => ({ prisma: {} }));

const updatedAt = new Date("2026-11-22T08:00:00.000Z");
const envConfig = { student: 17, teacher: 61, source: "env", updated_at: null };

function storedRow(student: number, teacher: number) {
  return { template: JSON.stringify({ student, teacher }), updatedAt };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("schema hạn mức AI", () => {
  it("chấp nhận cả hai đầu mút 1 và 1000", () => {
    expect(aiDailyLimitsSchema.parse({ student: 1, teacher: 1000 })).toEqual({ student: 1, teacher: 1000 });
  });

  it.each([
    { student: 0, teacher: 20 }, { student: -1, teacher: 20 }, { student: 1.5, teacher: 20 },
    { student: "5", teacher: 20 }, { student: 20, teacher: 1001 }, { student: 20 },
    { student: 5, teacher: 20, admin: 30 },
  ])("từ chối giá trị sai %j", (input) => {
    expect(aiDailyLimitsSchema.safeParse(input).success).toBe(false);
  });
});

describe("bộ đọc hạn mức AI", () => {
  it("đọc đúng hàng dành riêng và trả giới hạn kèm nguồn DB", async () => {
    const findUnique = vi.fn().mockResolvedValue(storedRow(5, 20));
    const reader = createAiDailyLimitsReader({ promptTemplate: { findUnique } });

    expect(await reader.getAiDailyLimitsConfig()).toEqual({
      student: 5, teacher: 20, source: "db", updated_at: updatedAt.toISOString(),
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: AI_DAILY_LIMITS_KEY }, select: { template: true, updatedAt: true },
    });
  });

  it.each([
    { name: "chưa có hàng", row: null },
    { name: "JSON hỏng", row: { template: "{broken_payload", updatedAt } },
    { name: "JSON sai kiểu", row: { template: '{"student":"5","teacher":20}', updatedAt } },
    { name: "JSON có field lạ", row: { template: '{"student":5,"teacher":20,"extra":"value"}', updatedAt } },
  ])("fallback env và chỉ log mã khi $name", async ({ row }) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const findUnique = vi.fn().mockResolvedValue(row);
    const reader = createAiDailyLimitsReader({ promptTemplate: { findUnique } });

    expect(await reader.getAiDailyLimitsConfig()).toEqual(envConfig);
    expect(await reader.getAiDailyLimitsConfig()).toEqual(envConfig);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls).toEqual([["AI_LIMITS_CONFIG_INVALID"]]);
  });

  it("các lần đọc đồng thời dùng chung một truy vấn", async () => {
    const findUnique = vi.fn().mockResolvedValue(storedRow(5, 20));
    const reader = createAiDailyLimitsReader({ promptTemplate: { findUnique } });
    const [first, second] = await Promise.all([reader.getAiDailyLimitsConfig(), reader.getAiDailyLimitsConfig()]);
    expect(first).toEqual(second);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("xóa cache có hiệu lực tức thì, bộ đọc khác cập nhật khi đủ 30 giây", async () => {
    let now = 0;
    let row = storedRow(5, 20);
    const findUnique = vi.fn(async () => row);
    const db = { promptTemplate: { findUnique } };
    const writer = createAiDailyLimitsReader(db, () => now);
    const other = createAiDailyLimitsReader(db, () => now);
    expect((await writer.getAiDailyLimitsConfig()).student).toBe(5);
    expect((await other.getAiDailyLimitsConfig()).student).toBe(5);

    row = storedRow(7, 25);
    writer.invalidateAiDailyLimitsCache();
    expect((await writer.getAiDailyLimitsConfig()).student).toBe(7);
    now = 29_999;
    expect((await other.getAiDailyLimitsConfig()).student).toBe(5);
    now = 30_000;
    expect((await other.getAiDailyLimitsConfig()).student).toBe(7);
    expect(findUnique).toHaveBeenCalledTimes(4);
  });

  it("kết quả của truy vấn cũ đang chạy không ghi đè cache đã xóa", async () => {
    let finishOldRead!: (row: ReturnType<typeof storedRow>) => void;
    const oldRead = new Promise<ReturnType<typeof storedRow>>((resolve) => { finishOldRead = resolve; });
    const findUnique = vi.fn().mockReturnValueOnce(oldRead).mockResolvedValueOnce(storedRow(7, 25));
    const reader = createAiDailyLimitsReader({ promptTemplate: { findUnique } });

    const old = reader.getAiDailyLimitsConfig();
    reader.invalidateAiDailyLimitsCache();
    expect((await reader.getAiDailyLimitsConfig()).student).toBe(7);
    finishOldRead(storedRow(5, 20));
    expect((await old).student).toBe(5);
    expect((await reader.getAiDailyLimitsConfig()).student).toBe(7);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("lỗi truy vấn DB được chuyển tiếp và lần gọi sau có thể đọc lại", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const findUnique = vi.fn().mockRejectedValueOnce(new Error("DB offline")).mockResolvedValueOnce(storedRow(7, 25));
    const reader = createAiDailyLimitsReader({ promptTemplate: { findUnique } });

    await expect(reader.getAiDailyLimitsConfig()).rejects.toThrow("DB offline");
    expect((await reader.getAiDailyLimitsConfig()).student).toBe(7);
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(warn).not.toHaveBeenCalled();
  });
});