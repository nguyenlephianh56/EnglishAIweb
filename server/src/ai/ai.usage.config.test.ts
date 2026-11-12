import { describe, expect, it, vi } from "vitest";

// env giả: không cần .env thật (env.ts thật sẽ process.exit nếu thiếu DATABASE_URL).
vi.mock("../config/env", () => ({
  env: { AI_DAILY_LIMIT_STUDENT: 10, AI_DAILY_LIMIT_TEACHER: 50 },
}));

// ai.usage.ts import prisma: mock để test không khởi tạo PrismaClient thật.
vi.mock("../config/prisma", () => ({ prisma: {} }));

import { dailyLimitForRole } from "./ai.usage";
import { dailyLimitsFromEnv } from "./ai.usage.config";

describe("dailyLimitsFromEnv", () => {
  it("đọc AI_DAILY_LIMIT_STUDENT / AI_DAILY_LIMIT_TEACHER", () => {
    expect(dailyLimitsFromEnv()).toEqual({ student: 10, teacher: 50 });
  });

  it("ghép với dailyLimitForRole ra đúng mức theo vai trò", () => {
    const limits = dailyLimitsFromEnv();
    expect(dailyLimitForRole("STUDENT", limits)).toBe(10);
    expect(dailyLimitForRole("TEACHER", limits)).toBe(50);
    expect(dailyLimitForRole("ADMIN", limits)).toBe(50);
  });
});