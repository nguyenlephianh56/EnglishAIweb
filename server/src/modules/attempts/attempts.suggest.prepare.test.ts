import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("../../config/prisma", () => ({ prisma: { attempt: { findFirst } } }));

import { prepareSuggest, SuggestInputError } from "./attempts.suggest.prepare";
import { findSuggestAttempt, suggestAttemptSelect } from "./attempts.suggest.scope";

const teacher = { id: 11, role: "TEACHER" as const };
const admin = { id: 1, role: "ADMIN" as const };
const student = { id: 21, role: "STUDENT" as const };

function row(type = "writing", answer: unknown = { text: "I go to school." }) {
  return {
    answer,
    score: null,
    teacherScore: null,
    aiFeedback: null,
    errors: null,
    exercise: { type, skill: "WRITING", level: "A2", content: { prompt: "Write." } },
  };
}

beforeEach(() => findFirst.mockReset());

describe("findSuggestAttempt — truy vấn phạm vi", () => {
  it("GV: lọc trong truy vấn theo lớp của mình (classes.teacher_id = userId)", async () => {
    findFirst.mockResolvedValue(row());
    await findSuggestAttempt(teacher, 5);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 5,
      assignment: { is: { class: { teacherId: 11 } } },
    });
  });

  it("ADMIN: mọi lớp nhưng bắt buộc có bài giao (loại bài tự luyện)", async () => {
    findFirst.mockResolvedValue(row());
    await findSuggestAttempt(admin, 5);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: 5, assignment: { isNot: null } });
  });

  it("STUDENT (hoặc vai trò lạ): không truy vấn DB, trả null", async () => {
    expect(await findSuggestAttempt(student, 5)).toBeNull();
    expect(await findSuggestAttempt({ id: 1, role: "X" as never }, 5)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("chỉ chọn đúng cột AI cần: không student, answer/explanation của bài, teacher_comment", () => {
    expect(Object.keys(suggestAttemptSelect).sort()).toEqual(
      ["aiFeedback", "answer", "errors", "exercise", "score", "teacherScore"],
    );
    expect(Object.keys(suggestAttemptSelect.exercise.select).sort()).toEqual(
      ["content", "level", "skill", "type"],
    );
  });
});

describe("prepareSuggest — 404 rồi 422 rồi dựng biến", () => {
  it("không thấy bài trong phạm vi -> 404 NOT_FOUND", async () => {
    findFirst.mockResolvedValue(null);
    await expect(prepareSuggest(teacher, 5)).rejects.toMatchObject({
      statusCode: 404, code: "NOT_FOUND", message: "Không tìm thấy bài nộp",
    });
  });

  it.each(["multiple_choice", "fill_blank", "matching", "error_correction", "listening_fill"])(
    "%s -> 422 UNSUPPORTED_EXERCISE_TYPE",
    async (type) => {
      findFirst.mockResolvedValue(row(type, ["a"]));
      await expect(prepareSuggest(teacher, 5)).rejects.toMatchObject({
        statusCode: 422, code: "UNSUPPORTED_EXERCISE_TYPE",
      });
    },
  );

  it.each([{ text: "" }, { text: "  \n " }, {}, null])("answer %j -> 422 NO_TEXT_TO_COMMENT", async (answer) => {
    findFirst.mockResolvedValue(row("writing", answer));
    await expect(prepareSuggest(teacher, 5)).rejects.toMatchObject({
      statusCode: 422, code: "NO_TEXT_TO_COMMENT",
    });
  });

  it("writing/speaking hợp lệ (kể cả chưa có điểm AI) -> trả attemptId + biến prompt", async () => {
    for (const type of ["writing", "speaking"]) {
      findFirst.mockResolvedValue(row(type));
      const result = await prepareSuggest(admin, 7);
      expect(result.attemptId).toBe(7);
      expect(result.variables).toMatchObject({ type, student_text: "I go to school." });
    }
  });

  it("lỗi là SuggestInputError, message không chứa nội dung bài làm", async () => {
    findFirst.mockResolvedValue(row("writing", { text: "   " }));
    const error = await prepareSuggest(teacher, 5).catch((e) => e);
    expect(error).toBeInstanceOf(SuggestInputError);
    expect(error.message).not.toContain("I go");
  });
});