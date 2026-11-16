/** T14 bước 4: test đơn vị nối hồ sơ khi regrade, không cần DB/AI thật. */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { db, gradeWritingMock, recomputeMock } = vi.hoisted(() => ({
  db: {
    attempt: {
      findFirst: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(), count: vi.fn(), create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  gradeWritingMock: vi.fn(),
  recomputeMock: vi.fn(),
}));
vi.mock("../../config/prisma", () => ({ prisma: db }));
vi.mock("../../config/env", () => ({
  env: { WRITING_MAX_WORDS: 600, WRITING_MAX_CHARS: 4000 },
}));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: gradeWritingMock }));
vi.mock("../skill-profiles/skill-profiles.recompute", () => ({
  recomputeSkillProfile: recomputeMock,
}));

import * as refreshModule from "../skill-profiles/skill-profiles.refresh";
import { AIQuotaExceededError, AIUsageCheckError } from "../../ai/ai.types";
import { AIInvalidFormatError } from "../../ai/json";
import { AIServiceError } from "../../ai/resilience";
import { regradeAttempt } from "./attempts.service";

const realRefresh = refreshModule.refreshProfileAfterGrading;
const student = { id: 7, role: "STUDENT" } as const;
const submittedAt = new Date("2026-11-15T08:00:00.000Z");
const exercise = {
  id: 11, type: "writing", skill: "WRITING", level: "A2", topic: "Một ngày của em",
  content: { prompt: "Write about your day", minWords: 1 },
  answer: null, explanation: "Gợi ý của giáo viên.",
};
const grade = {
  criteria: { content: 7, coherence: 7, vocabulary: 7, grammar: 8 },
  comment: "Bài viết khá tốt.",
  errors: [{ type: "grammar:tense", text: "I goes", correction: "I go" }],
};
const makeAttempt = (assignmentId: number | null = null, dueAt: Date | null = null, isLate = false) => ({
  id: 42, assignmentId, answer: { text: "I goes to school every day." },
  score: null as number | null, maxScore: 10, errors: [] as unknown[],
  aiFeedback: null as unknown, teacherScore: null, isLate, submittedAt,
  assignment: dueAt === null ? null : { dueAt }, exercise,
});
const expected = {
  attemptId: 42, score: 7.25, maxScore: 10, graded: true,
  correct: 0, total: 0, errors: grade.errors, criteria: grade.criteria, comment: grade.comment,
  attemptNo: 2, isLate: false, submittedAt,
};
const practiceExpected = { ...expected, explanation: exercise.explanation };
let stored: ReturnType<typeof makeAttempt>;
let scoreAtRefresh: number | null | undefined;
let refreshSpy: MockInstance<typeof realRefresh>;

beforeEach(() => {
  vi.resetAllMocks();
  stored = makeAttempt();
  scoreAtRefresh = undefined;
  refreshSpy = vi.spyOn(refreshModule, "refreshProfileAfterGrading")
    .mockImplementation(async (client, attemptId) => {
      scoreAtRefresh = stored.score;
      await realRefresh(client, attemptId);
    });
  db.attempt.findFirst.mockImplementation(async () => structuredClone(stored));
  gradeWritingMock.mockResolvedValue(structuredClone(grade));
  db.attempt.updateMany.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data };
    return { count: 1 };
  });
  db.attempt.findUniqueOrThrow.mockImplementation(async () => stored);
  db.attempt.findUnique.mockResolvedValue({ studentId: student.id, exercise: { skill: "WRITING" } });
  db.attempt.count.mockResolvedValue(3);
  db.$queryRaw.mockResolvedValue([{ id: 42, attempt_no: 2 }]);
  recomputeMock.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("regradeAttempt → refresh hồ sơ", () => {
  it.each([
    { label: "tự luyện", assigned: false, pastDue: false, late: false },
    { label: "bài giao còn hạn", assigned: true, pastDue: false, late: false },
    { label: "chấm lại sau hạn, nộp đúng hạn", assigned: true, pastDue: true, late: false },
    { label: "bài giao nộp trễ", assigned: true, pastDue: true, late: true },
  ])("$label: gọi đúng 1 lần sau ghi điểm, giữ nguyên response", async ({ assigned, pastDue, late }) => {
    stored = makeAttempt(assigned ? 21 : null,
      assigned ? new Date(Date.now() + (pastDue ? -3_600_000 : 3_600_000)) : null, late);
    const result = await regradeAttempt(student, 42);

    expect(db.attempt.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, studentId: student.id },
    }));
    expect(gradeWritingMock).toHaveBeenCalledExactlyOnceWith({
      userId: student.id, role: student.role, text: "I goes to school every day.",
      prompt: exercise.content.prompt, minWords: 1, level: exercise.level,
    });
    expect(scoreAtRefresh).toBe(7.25);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(recomputeMock).toHaveBeenCalledExactlyOnceWith(db, student.id, "WRITING");
    expect(db.attempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, score: null }, data: expect.objectContaining({ score: 7.25 }),
    }));
    expect(db.attempt.create).not.toHaveBeenCalled();
    expect(stored.submittedAt).toEqual(submittedAt);
    expect(stored.isLate).toBe(late);
    expect(result).toEqual({
      ...expected, isLate: late,
      errors: assigned && !pastDue ? [{ type: "grammar:tense", text: "I goes" }] : grade.errors,
      ...(!assigned || pastDue ? { explanation: exercise.explanation } : {}),
      ...(assigned ? { attemptsLeft: 0 } : {}),
    });
    if (assigned) expect(db.attempt.count).toHaveBeenCalledExactlyOnceWith({
      where: { studentId: student.id, assignmentId: 21 },
    });
    else expect(db.attempt.count).not.toHaveBeenCalled();
  });

  it("written=true với điểm 0 vẫn refresh", async () => {
    gradeWritingMock.mockResolvedValue({ ...grade,
      criteria: { content: 0, coherence: 0, vocabulary: 0, grammar: 0 } });
    expect(await regradeAttempt(student, 42)).toMatchObject({ score: 0, graded: true });
    expect(scoreAtRefresh).toBe(0);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
  });

  it("written=false: thua đua trả 409 như cũ, không refresh", async () => {
    db.attempt.updateMany.mockImplementationOnce(async () => {
      stored = { ...stored, score: 8 };
      return { count: 0 };
    });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({
      statusCode: 409, code: "ATTEMPT_ALREADY_GRADED", message: "Bài này vừa được chấm xong",
    });
    expect(stored.score).toBe(8);
    expect(db.attempt.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it.each([0, 7.25])("attempt đã có điểm %s: trả 409, không chấm/refresh", async (score) => {
    stored.score = score;
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({
      statusCode: 409, code: "ATTEMPT_ALREADY_GRADED", message: "Bài này đã được chấm rồi",
    });
    expect(gradeWritingMock).not.toHaveBeenCalled();
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["AI_QUOTA_EXCEEDED", new AIQuotaExceededError()],
    ["RATE_LIMITED", new AIServiceError("RATE_LIMITED", 1)],
    ["TIMEOUT", new AIServiceError("TIMEOUT", 1)],
    ["AI_UNAVAILABLE", new AIServiceError("AI_UNAVAILABLE", 1)],
    ["AI_INVALID_FORMAT", new AIInvalidFormatError(2)],
    ["AI_ERROR", new AIServiceError("AI_ERROR", 1)],
    ["AI_USAGE_CHECK_FAILED", new AIUsageCheckError()],
  ])("AI lỗi %s: giữ score=NULL, không refresh", async (code, error) => {
    gradeWritingMock.mockRejectedValue(error);
    expect(await regradeAttempt(student, 42)).toEqual({
      attemptId: 42,
      attempt: { attemptId: 42, score: null, maxScore: 10, graded: false,
        correct: 0, total: 0, errors: [], explanation: exercise.explanation,
        attemptNo: 2, isLate: false, submittedAt },
      gradingError: { code, message: expect.stringContaining("đã được lưu") },
    });
    expect(stored.score).toBeNull();
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(db.attempt.create).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: "không có quyền/không tồn tại", statusCode: 404, code: "NOT_FOUND" },
    { label: "không phải writing", statusCode: 400, code: "NOT_REGRADABLE" },
    { label: "bài làm không hợp lệ", statusCode: 422, code: "ATTEMPT_DATA_INVALID" },
  ])("$label: không chấm/refresh", async ({ statusCode, code }) => {
    if (statusCode === 404) db.attempt.findFirst.mockResolvedValue(null);
    if (statusCode === 400) db.attempt.findFirst.mockResolvedValue({
      ...stored, exercise: { ...exercise, type: "fill_blank" },
    });
    if (statusCode === 422) db.attempt.findFirst.mockResolvedValue({ ...stored, answer: {} });
    await expect(regradeAttempt(student, 42)).rejects.toMatchObject({ statusCode, code });
    expect(gradeWritingMock).not.toHaveBeenCalled();
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("ghi điểm thất bại: ném lỗi như cũ, không refresh", async () => {
    const error = new Error("WRITE_FAILED");
    db.attempt.updateMany.mockRejectedValue(error);
    await expect(regradeAttempt(student, 42)).rejects.toBe(error);
    expect(stored.score).toBeNull();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("refresh lỗi: giữ điểm, response như cũ, chỉ log mã lỗi an toàn", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recomputeMock.mockRejectedValue(Object.assign(new Error("NOI_DUNG_BI_MAT"), { code: "P2002" }));
    expect(await regradeAttempt(student, 42)).toEqual(practiceExpected);
    expect(stored.score).toBe(7.25);
    expect(db.attempt.create).not.toHaveBeenCalled();
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[skill-profiles] refresh_after_grading_failed",
      { studentId: student.id, skill: "WRITING", code: "P2002" },
    );
  });

  it("await refresh xong mới trả kết quả regrade", async () => {
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    recomputeMock.mockImplementation(async () => { entered(); await pending; });
    let finished = false;
    const request = regradeAttempt(student, 42).then((result) => {
      finished = true;
      return result;
    });
    try {
      await started;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(stored.score).toBe(7.25);
      expect(finished).toBe(false);
    } finally { release(); }
    expect(await request).toEqual(practiceExpected);
  });
});