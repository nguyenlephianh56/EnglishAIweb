/**
 * Test `recommendExercises` / `getMyRecommendations` (T24) với Prisma GIẢ LẬP: không cần DB, không cần .env.
 * Kiểm tra câu truy vấn gửi đi đúng điều kiện (thư viện, skill, mức, chưa có attempt, thứ tự, số lượng),
 * không đọc cột nhạy cảm, không ghi DB. Việc lọc thật bằng SQL được kiểm ở learning-paths.recommendations.db.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const readSavedSkillProfiles = vi.fn();

vi.mock("../../config/prisma", () => ({
  // Chỉ có findMany: nếu code lỡ gọi create/update/delete thì test sẽ lỗi ngay.
  prisma: { exercise: { findMany: (...args: unknown[]) => findMany(...args) } },
}));
vi.mock("../skill-profiles/skill-profiles.service", () => ({
  readSavedSkillProfiles: (...args: unknown[]) => readSavedSkillProfiles(...args),
}));

import { getMyRecommendations, recommendExercises } from "./learning-paths.service";

const SKILLS = ["LISTENING", "SPEAKING", "READING", "WRITING", "FOUNDATION"];
const row = (id: number, skill: string, level = "A1", day = id) => ({
  id,
  type: "fill_blank",
  skill,
  level,
  topic: `topic ${id}`,
  createdAt: new Date(Date.UTC(2026, 0, day)),
});

/** Giả lập DB: trả bài theo `where.skill` (đã "lọc" sẵn như SQL sẽ làm). */
const setLibrary = (pool: Record<string, ReturnType<typeof row>[]>) => {
  findMany.mockImplementation(async (args: { where: { skill: string }; take: number }) =>
    (pool[args.where.skill] ?? []).slice(0, args.take)
  );
};

beforeEach(() => {
  findMany.mockReset();
  readSavedSkillProfiles.mockReset();
  readSavedSkillProfiles.mockResolvedValue([]);
  setLibrary({});
});

describe("recommendExercises: câu truy vấn", () => {
  it("HS chưa có hồ sơ: đúng 5 truy vấn bài, mỗi kỹ năng một lần, theo thứ tự enum, mức A1", async () => {
    await recommendExercises(7, 5);

    expect(readSavedSkillProfiles).toHaveBeenCalledWith(7);
    expect(findMany).toHaveBeenCalledTimes(5);
    expect(findMany.mock.calls.map((call) => call[0].where.skill)).toEqual(SKILLS);
    for (const [args] of findMany.mock.calls) {
      expect(args.where).toEqual({
        skill: args.where.skill,
        level: "A1",
        status: "PUBLISHED",
        inLibrary: true,
        attempts: { none: { studentId: 7 } },
      });
      expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
      expect(args.take).toBe(2); // M = 2
    }
  });

  it("chỉ select 5 field hiển thị + createdAt: không đọc content/answer/explanation", async () => {
    await recommendExercises(7, 5);
    for (const [args] of findMany.mock.calls) {
      expect(Object.keys(args.select).sort()).toEqual(["createdAt", "id", "level", "skill", "topic", "type"]);
    }
  });

  it("mức mục tiêu = level hiện tại của hồ sơ; level null thì A1; thứ tự truy vấn theo kỹ năng đã xếp", async () => {
    readSavedSkillProfiles.mockResolvedValue([
      { skill: "WRITING", score: 5, level: "A2", errorStats: null },
      { skill: "READING", score: 7, level: null, errorStats: null },
    ]);
    await recommendExercises(7, 5);

    const calls = findMany.mock.calls.map(([args]) => [args.where.skill, args.where.level]);
    expect(calls).toEqual([
      ["WRITING", "A2"],
      ["READING", "A1"],
      ["LISTENING", "A1"],
      ["SPEAKING", "A1"],
      ["FOUNDATION", "A1"],
    ]);
  });

  it("studentId trong điều kiện 'chưa có attempt' đúng là studentId được truyền vào", async () => {
    await recommendExercises(42, 5);
    for (const [args] of findMany.mock.calls) {
      expect(args.where.attempts).toEqual({ none: { studentId: 42 } });
    }
  });

  it("limit không hợp lệ thì không truy vấn gì và trả rỗng", async () => {
    for (const limit of [0, -1, 2.5, Number.NaN]) {
      expect(await recommendExercises(7, limit)).toEqual([]);
    }
    expect(findMany).not.toHaveBeenCalled();
    expect(readSavedSkillProfiles).not.toHaveBeenCalled();
  });
});

describe("recommendExercises: kết quả", () => {
  it("xen kẽ theo kỹ năng yếu nhất trước, mỗi gợi ý mang reason và focusErrorType", async () => {
    readSavedSkillProfiles.mockResolvedValue([
      { skill: "WRITING", score: 2, level: "A1", errorStats: { "grammar:tense": 3 } },
      { skill: "READING", score: 6, level: "A1", errorStats: {} },
    ]);
    setLibrary({
      WRITING: [row(1, "WRITING"), row(2, "WRITING")],
      READING: [row(11, "READING"), row(12, "READING")],
      LISTENING: [row(21, "LISTENING")],
    });

    const result = await recommendExercises(7, 10);
    expect(result.map((r) => r.exercise.id)).toEqual([1, 11, 21, 2, 12]);
    expect(result[0]).toMatchObject({ reason: "weakest_skill", focusErrorType: "grammar:tense" });
    expect(result[1]).toMatchObject({ reason: "weakest_skill", focusErrorType: null });
    expect(result[2]).toMatchObject({ reason: "no_data_skill", focusErrorType: null });
  });

  it("thư viện rỗng -> rỗng; kỹ năng hết bài bị bỏ qua", async () => {
    expect(await recommendExercises(7, 5)).toEqual([]);

    setLibrary({ SPEAKING: [row(31, "SPEAKING")] });
    const result = await recommendExercises(7, 5);
    expect(result.map((r) => r.skill)).toEqual(["SPEAKING"]);
  });

  it("limit cắt tổng số bài; gọi hai lần cho kết quả giống hệt (tất định)", async () => {
    setLibrary({
      LISTENING: [row(21, "LISTENING"), row(22, "LISTENING")],
      SPEAKING: [row(31, "SPEAKING"), row(32, "SPEAKING")],
      READING: [row(41, "READING"), row(42, "READING")],
    });
    const first = await recommendExercises(7, 4);
    const second = await recommendExercises(7, 4);
    expect(first.map((r) => r.exercise.id)).toEqual([21, 31, 41, 22]);
    expect(second).toEqual(first);
  });
});

describe("getMyRecommendations: hình dạng response", () => {
  it("mỗi phần tử chỉ có exercise {id,type,skill,level,topic}, reason, focus_error_type", async () => {
    readSavedSkillProfiles.mockResolvedValue([
      { skill: "WRITING", score: 2, level: "A1", errorStats: { vocab: 2 } },
    ]);
    // Dù DB (hay một lần sửa select sau này) trả thêm field nhạy cảm, view vẫn phải loại bỏ.
    findMany.mockImplementation(async (args: { where: { skill: string } }) =>
      args.where.skill === "WRITING"
        ? [{ ...row(1, "WRITING"), content: "SECRET_CONTENT", answer: "SECRET_ANSWER", explanation: "SECRET_EXPL" }]
        : []
    );

    const data = await getMyRecommendations(7, 5);
    expect(data).toEqual([
      {
        exercise: { id: 1, type: "fill_blank", skill: "WRITING", level: "A1", topic: "topic 1" },
        reason: "weakest_skill",
        focus_error_type: "vocab",
      },
    ]);
    expect(Object.keys(data[0]).sort()).toEqual(["exercise", "focus_error_type", "reason"]);
    expect(JSON.stringify(data)).not.toMatch(/SECRET|createdAt|content|answer|explanation/);
  });
});