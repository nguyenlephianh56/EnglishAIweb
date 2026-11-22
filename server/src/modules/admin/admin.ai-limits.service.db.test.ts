import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dailyLimitsFromEnv } from "../../ai/ai.usage.config";
import { AI_DAILY_LIMITS_KEY, createAiDailyLimitsReader } from "../../ai/ai.usage.settings";
import { updateAdminAiLimits } from "./admin.ai-limits.service";
import { createPromptTestDb } from "./admin.prompts-db-fixture";

const key = AI_DAILY_LIMITS_KEY;
const adminId = 42;
let db: Awaited<ReturnType<typeof createPromptTestDb>>;

beforeAll(async () => {
  db = await createPromptTestDb(adminId);
});

beforeEach(async () => {
  await db.$transaction([db.auditLog.deleteMany(), db.promptTemplate.deleteMany()]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await db?.$disconnect();
});

const audits = () => db.auditLog.findMany({
  orderBy: { id: "asc" },
  select: { userId: true, action: true, detail: true },
});

describe("ghi hạn mức AI trên PostgreSQL", () => {
  it("lưu ở đúng key, ghi audit từ env và làm mới cache sau commit", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let now = 0;
    const current = createAiDailyLimitsReader(db, () => now);
    const other = createAiDailyLimitsReader(db, () => now);
    const from = dailyLimitsFromEnv();
    const before = { ...from, source: "env", updated_at: null };
    const to = { student: 5, teacher: 20 };

    expect(await current.getAiDailyLimitsConfig()).toEqual(before);
    expect(await other.getAiDailyLimitsConfig()).toEqual(before);
    const updated = await updateAdminAiLimits(adminId, to, db, current.invalidateAiDailyLimitsCache);

    const row = await db.promptTemplate.findUniqueOrThrow({ where: { key } });
    expect(row.template).toBe(JSON.stringify(to));
    expect(updated).toEqual({ ...to, source: "db", updated_at: row.updatedAt.toISOString() });
    expect(await current.getAiDailyLimitsConfig()).toEqual(updated);
    expect(await audits()).toEqual([{ userId: adminId, action: "ai_limits.update", detail: { from, to } }]);

    now = 29_999;
    expect(await other.getAiDailyLimitsConfig()).toEqual(before);
    now = 30_000;
    expect(await other.getAiDailyLimitsConfig()).toEqual(updated);
  });

  it("audit lần ghi sau dùng giá trị DB mới nhất dù cache vẫn giữ giá trị cũ", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const current = createAiDailyLimitsReader(db, () => 0);
    const other = createAiDailyLimitsReader(db, () => 0);
    const first = { student: 5, teacher: 20 };
    const second = { student: 7, teacher: 25 };
    const third = { student: 9, teacher: 30 };

    const saved = await updateAdminAiLimits(adminId, first, db, current.invalidateAiDailyLimitsCache);
    expect(await current.getAiDailyLimitsConfig()).toEqual(saved);
    await updateAdminAiLimits(adminId, second, db, other.invalidateAiDailyLimitsCache);
    expect(await current.getAiDailyLimitsConfig()).toEqual(saved);
    await updateAdminAiLimits(adminId, third, db, current.invalidateAiDailyLimitsCache);

    expect(await audits()).toEqual([
      { userId: adminId, action: "ai_limits.update", detail: { from: dailyLimitsFromEnv(), to: first } },
      { userId: adminId, action: "ai_limits.update", detail: { from: first, to: second } },
      { userId: adminId, action: "ai_limits.update", detail: { from: second, to: third } },
    ]);
    expect(await current.getAiDailyLimitsConfig()).toMatchObject({ ...third, source: "db" });
    expect(await db.promptTemplate.count({ where: { key } })).toBe(1);
  });

  it("sửa hàng JSON hỏng, dùng env cho from và chỉ log mã lỗi", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await db.promptTemplate.create({ data: { key, template: "{private_broken_payload" } });
    const to = { student: 1, teacher: 1000 };

    await expect(updateAdminAiLimits(adminId, to, db, vi.fn())).resolves.toMatchObject({ ...to, source: "db" });
    expect(await audits()).toEqual([{
      userId: adminId, action: "ai_limits.update", detail: { from: dailyLimitsFromEnv(), to },
    }]);
    expect(warn.mock.calls).toEqual([["AI_LIMITS_CONFIG_INVALID"]]);
  });

  it("rollback cấu hình và giữ cache khi ghi audit thất bại", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const current = createAiDailyLimitsReader(db, () => 0);
    const invalidate = vi.fn(current.invalidateAiDailyLimitsCache);
    const rejectedAdminId = adminId + 1;
    const initial = { student: 5, teacher: 20 };
    const replacement = { student: 7, teacher: 25 };

    await expect(updateAdminAiLimits(rejectedAdminId, initial, db, invalidate)).rejects.toThrow();
    expect(await db.promptTemplate.findUnique({ where: { key } })).toBeNull();
    expect(await audits()).toEqual([]);
    expect(invalidate).not.toHaveBeenCalled();

    const saved = await updateAdminAiLimits(adminId, initial, db, invalidate);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(await current.getAiDailyLimitsConfig()).toEqual(saved);
    await expect(updateAdminAiLimits(rejectedAdminId, replacement, db, invalidate)).rejects.toThrow();
    expect(invalidate).toHaveBeenCalledTimes(1);
    const row = await db.promptTemplate.findUniqueOrThrow({ where: { key } });
    expect(row.template).toBe(JSON.stringify(initial));
    expect(row.updatedAt.toISOString()).toBe(saved.updated_at);
    expect(await current.getAiDailyLimitsConfig()).toEqual(saved);
    expect(await audits()).toHaveLength(1);
  });
});