/** T14 bước 3: test đơn vị nối hồ sơ sau chấm writing, không cần DB/AI thật. */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { db, tx, gradeWritingMock, recomputeMock } = vi.hoisted(() => ({
  db: {
    exercise: { findFirst: vi.fn() },
    assignment: { findUnique: vi.fn() },
    classMember: { findUnique: vi.fn() },
    attempt: {
      count: vi.fn(), findUnique: vi.fn(),
      updateMany: vi.fn(), findUniqueOrThrow: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  tx: { attempt: { create: vi.fn(), count: vi.fn() }, $executeRaw: vi.fn() },
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
import { submitAttempt } from "./attempts.service";
import type { CreateAttemptInput } from "./attempts.schema";

const realRefresh = refreshModule.refreshProfileAfterGrading;
const student = { id: 7, role: "STUDENT" } as const;
const input: CreateAttemptInput = {
  exerciseId: 11, answer: { text: "I goes to school every day." }, mode: "practice",
};
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
const expected = {
  attemptId: 42, score: 7.25, maxScore: 10, graded: true,
  correct: 0, total: 0, errors: grade.errors, criteria: grade.criteria, comment: grade.comment,
};
const practiceExpected = { ...expected, explanation: exercise.explanation };
let stored: { id: number; score: number | null; maxScore: number; errors: unknown; aiFeedback: unknown };
let committed: boolean;
let inTransaction: boolean;
let scoreAtRefresh: number | null | undefined;
let refreshSpy: MockInstance<typeof realRefresh>;

beforeEach(() => {
  vi.resetAllMocks();
  committed = false;
  inTransaction = false;
  scoreAtRefresh = undefined;
  stored = { id: 42, score: null, maxScore: 10, errors: [], aiFeedback: null };
  refreshSpy = vi.spyOn(refreshModule, "refreshProfileAfterGrading")
    .mockImplementation(async (client, attemptId) => {
      scoreAtRefresh = stored.score;
      await realRefresh(client, attemptId);
    });
  db.exercise.findFirst.mockResolvedValue(exercise);
  db.assignment.findUnique.mockResolvedValue({ id: 21, classId: 31, exerciseId: 11,
    dueAt: new Date(Date.now() + 3_600_000) });
  db.classMember.findUnique.mockResolvedValue({ studentId: student.id });
  db.attempt.count.mockResolvedValue(2);
  tx.attempt.count.mockResolvedValue(2);
  tx.attempt.create.mockImplementation(async ({ data }) => {
    stored = { ...stored, score: data.score, errors: data.errors };
    return { id: stored.id, score: stored.score, maxScore: stored.maxScore, errors: stored.errors };
  });
  db.$transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
    inTransaction = true;
    try {
      const result = await work(tx);
      committed = true;
      return result;
    } finally { inTransaction = false; }
  });
  gradeWritingMock.mockImplementation(async () => {
    expect(committed).toBe(true);
    expect(inTransaction).toBe(false);
    return structuredClone(grade);
  });
  db.attempt.updateMany.mockImplementation(async ({ data }) => {
    stored = { ...stored, ...data };
    return { count: 1 };
  });
  db.attempt.findUniqueOrThrow.mockImplementation(async () => stored);
  db.attempt.findUnique.mockResolvedValue({ studentId: student.id, exercise: { skill: "WRITING" } });
  recomputeMock.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("submitAttempt writing → refresh hồ sơ", () => {
  it.each([
    { label: "tự luyện", assigned: false, late: false },
    { label: "bài giao còn hạn", assigned: true, late: false },
    { label: "bài giao nộp trễ", assigned: true, late: true },
  ])("$label: gọi đúng 1 lần sau ghi điểm, giữ nguyên response", async ({ assigned, late }) => {
    if (late) db.assignment.findUnique.mockResolvedValue({
      id: 21, classId: 31, exerciseId: 11, dueAt: new Date(Date.now() - 3_600_000),
    });
    const result = await submitAttempt(student, {
      ...input, ...(assigned ? { assignmentId: 21 } : {}),
    });

    expect(scoreAtRefresh).toBe(7.25);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(recomputeMock).toHaveBeenCalledExactlyOnceWith(db, student.id, "WRITING");
    expect(tx.attempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ studentId: student.id, score: null, isLate: late }),
    }));
    expect(db.attempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 42, score: null }, data: expect.objectContaining({ score: 7.25 }),
    }));
    expect(result).toEqual({
      ...expected,
      errors: assigned && !late ? [{ type: "grammar:tense", text: "I goes" }] : grade.errors,
      ...(!assigned || late ? { explanation: exercise.explanation } : {}),
      ...(assigned ? { attemptNo: 3, attemptsLeft: 0 } : {}),
    });
  });

  it("written=true với điểm 0 vẫn refresh", async () => {
    gradeWritingMock.mockResolvedValue({ ...grade,
      criteria: { content: 0, coherence: 0, vocabulary: 0, grammar: 0 } });
    expect(await submitAttempt(student, input)).toMatchObject({ score: 0, graded: true });
    expect(scoreAtRefresh).toBe(0);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
  });

  it("written=false: trả điểm đã có trong DB, không refresh thêm", async () => {
    db.attempt.updateMany.mockImplementationOnce(async () => {
      stored = { ...stored, score: 8, errors: [], aiFeedback: null };
      return { count: 0 };
    });
    expect(await submitAttempt(student, input)).toEqual({
      attemptId: 42, score: 8, maxScore: 10, graded: true,
      correct: 0, total: 0, errors: [], explanation: exercise.explanation,
    });
    expect(db.attempt.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["AI_QUOTA_EXCEEDED", new AIQuotaExceededError()],
    ["RATE_LIMITED", new AIServiceError("RATE_LIMITED", 1)],
    ["TIMEOUT", new AIServiceError("TIMEOUT", 1)],
    ["AI_UNAVAILABLE", new AIServiceError("AI_UNAVAILABLE", 1)],
    ["AI_INVALID_FORMAT", new AIInvalidFormatError(2)],
    ["AI_ERROR", new AIServiceError("AI_ERROR", 1)],
    ["AI_USAGE_CHECK_FAILED", new AIUsageCheckError()],
  ])("AI lỗi %s: giữ score=NULL, không gọi refresh", async (code, error) => {
    gradeWritingMock.mockRejectedValue(error);
    expect(await submitAttempt(student, input)).toEqual({
      attemptId: 42,
      attempt: { attemptId: 42, score: null, maxScore: 10, graded: false,
        correct: 0, total: 0, errors: [], explanation: exercise.explanation },
      gradingError: { code, message: expect.stringContaining("đã được lưu") },
    });
    expect(tx.attempt.create).toHaveBeenCalledTimes(1);
    expect(stored.score).toBeNull();
    expect(db.attempt.updateMany).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(recomputeMock).not.toHaveBeenCalled();
  });

  it.each(["minWords", "permission", "limit", "race"])(
    "%s: từ chối trước lưu/chấm thì không refresh", async (reason) => {
      let statusCode = 400;
      if (reason === "minWords") db.exercise.findFirst.mockResolvedValue({
        ...exercise, content: { ...exercise.content, minWords: 100 },
      });
      if (reason === "permission") {
        db.classMember.findUnique.mockResolvedValue(null);
        statusCode = 404;
      }
      if (reason === "limit" || reason === "race") {
        (reason === "limit" ? db : tx).attempt.count.mockResolvedValue(3);
        statusCode = 409;
      }
      await expect(submitAttempt(student, { ...input, assignmentId: 21 }))
        .rejects.toMatchObject({ statusCode });
      expect(tx.attempt.create).not.toHaveBeenCalled();
      expect(gradeWritingMock).not.toHaveBeenCalled();
      expect(db.attempt.updateMany).not.toHaveBeenCalled();
      expect(refreshSpy).not.toHaveBeenCalled();
    },
  );

  it("ghi điểm thất bại: ném lỗi như cũ, không refresh", async () => {
    const error = new Error("WRITE_FAILED");
    db.attempt.updateMany.mockRejectedValue(error);
    await expect(submitAttempt(student, input)).rejects.toBe(error);
    expect(stored.score).toBeNull();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("refresh lỗi: điểm vẫn còn, response như cũ, chỉ log mã lỗi an toàn", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recomputeMock.mockRejectedValue(Object.assign(new Error("NOI_DUNG_BI_MAT"), { code: "P2002" }));
    expect(await submitAttempt(student, input)).toEqual(practiceExpected);
    expect(stored.score).toBe(7.25);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[skill-profiles] refresh_after_grading_failed",
      { studentId: student.id, skill: "WRITING", code: "P2002" },
    );
  });

  it("await refresh xong mới trả kết quả writing", async () => {
    let release!: () => void;
    let entered!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    recomputeMock.mockImplementation(async () => { entered(); await pending; });
    let finished = false;
    const request = submitAttempt(student, input).then((result) => {
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