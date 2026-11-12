import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// env giả: không cần .env thật (env.ts thật sẽ process.exit nếu thiếu DATABASE_URL).
const fakeEnv = vi.hoisted(() => ({ AI_CACHE_TASKS: "grade_writing,grade_speaking,analysis,path" }));
vi.mock("../config/env", () => ({ env: fakeEnv }));

import { cacheableTasksFromEnv } from "./ai.cache.config";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("cacheableTasksFromEnv", () => {
  it("đọc AI_CACHE_TASKS thành tập task", () => {
    fakeEnv.AI_CACHE_TASKS = "analysis, path";
    expect([...cacheableTasksFromEnv()].sort()).toEqual(["analysis", "path"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("giá trị mặc định -> 4 task, không có generate", () => {
    fakeEnv.AI_CACHE_TASKS = "grade_writing,grade_speaking,analysis,path";
    const tasks = cacheableTasksFromEnv();
    expect(tasks.size).toBe(4);
    expect(tasks.has("generate")).toBe(false);
  });

  it("tên sai bị bỏ qua, cảnh báo chỉ nói số lượng, không đưa nội dung cấu hình vào log", () => {
    fakeEnv.AI_CACHE_TASKS = "analysis,tên_bí_mật_sai";
    const tasks = cacheableTasksFromEnv();
    expect([...tasks]).toEqual(["analysis"]);

    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0]?.[0]);
    expect(text).toContain("1");
    expect(text).not.toContain("tên_bí_mật_sai");
  });

  it("toàn bộ tên sai -> tập rỗng (không task nào được cache)", () => {
    fakeEnv.AI_CACHE_TASKS = "x,y";
    expect(cacheableTasksFromEnv().size).toBe(0);
  });
});