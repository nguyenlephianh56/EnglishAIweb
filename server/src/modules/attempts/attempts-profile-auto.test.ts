/** T14 bước 2: test đơn vị nối hồ sơ sau chấm tự động, không cần DB/AI thật. */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

const { db, tx, recomputeMock } = vi.hoisted(() => ({
  db: {
    exercise: { findFirst: vi.fn() },
    assignment: { findUnique: vi.fn() },
    classMember: { findUnique: vi.fn() },
    attempt: { count: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  tx: {
    attempt: { create: vi.fn(), count: vi.fn() },
    $executeRaw: vi.fn(),
  },
  recomputeMock: vi.fn(),
}));
vi.mock("../../config/prisma", () => ({ prisma: db }));
vi.mock("../../config/env", () => ({
  env: { WRITING_MAX_WORDS: 600, WRITING_MAX_CHARS: 4000 },
}));
vi.mock("../../ai/writingGrader", () => ({ gradeWriting: vi.fn() }));
vi.mock("../skill-profiles/skill-profiles.recompute", () => ({
  recomputeSkillProfile: recomputeMock,
}));

import * as refreshModule from "../skill-profiles/skill-profiles.refresh";
import { submitAttempt } from "./attempts.service";
import type { CreateAttemptInput } from "./attempts.schema";

const realRefresh = refreshModule.refreshProfileAfterGrading;
const student = { id: 7, role: "STUDENT" } as const;
const input = { exerciseId: 11, answer: ["goes"], mode: "practice" } as const;
const exercise = {
  id: 11, type: "fill_blank", skill: "FOUNDATION", level: "A1",
  topic: "Điền từ", content: { text: "She ___." },
  answer: ["goes"], explanation: "Giải thích mẫu.",
};
const expected = {
  attemptId: 42, score: 10, maxScore: 10, graded: true,
  correct: 1, total: 1, errors: [],
};
let committed: boolean;
let committedAtRefresh: boolean | undefined;
let refreshSpy: MockInstance<typeof realRefresh>;

beforeEach(() => {
  vi.resetAllMocks();
  committed = false;
  committedAtRefresh = undefined;
  refreshSpy = vi.spyOn(refreshModule, "refreshProfileAfterGrading")
    .mockImplementation(async (client, attemptId) => {
      committedAtRefresh = committed;
      await realRefresh(client, attemptId);
    });
  db.exercise.findFirst.mockResolvedValue(exercise);
  db.assignment.findUnique.mockResolvedValue({ id: 21, classId: 31, exerciseId: 11,
    dueAt: new Date(Date.now() + 3_600_000) });
  db.classMember.findUnique.mockResolvedValue({ studentId: student.id });
  db.attempt.count.mockResolvedValue(2);
  tx.attempt.count.mockResolvedValue(2);
  tx.attempt.create.mockImplementation(async ({ data }) => ({
    id: 42, score: data.score, maxScore: data.maxScore, errors: data.errors,
  }));
  db.$transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
    const result = await work(tx);
    committed = true;
    return result;
  });
  db.attempt.findUnique.mockResolvedValue({ studentId: student.id,
    exercise: { skill: exercise.skill } });
  recomputeMock.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("submitAttempt tự động → refresh hồ sơ", () => {
  it.each([
    { label: "tự luyện", assigned: false, late: false },
    { label: "bài giao còn hạn", assigned: true, late: false },
    { label: "bài giao nộp trễ", assigned: true, late: true },
  ])("$label: gọi đúng 1 lần sau commit, giữ nguyên response", async ({ assigned, late }) => {
    if (late) db.assignment.findUnique.mockResolvedValue({
      id: 21, classId: 31, exerciseId: 11, dueAt: new Date(Date.now() - 3_600_000),
    });
    const result = await submitAttempt(student, {
      ...input, ...(assigned ? { assignmentId: 21 } : {}),
    });

    expect(committedAtRefresh).toBe(true);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(recomputeMock).toHaveBeenCalledExactlyOnceWith(db, student.id, "FOUNDATION");
    expect(tx.attempt.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ studentId: student.id, score: 10, isLate: late }),
    }));
    expect(result).toEqual({
      ...expected,
      ...(!assigned || late ? { explanation: exercise.explanation } : {}),
      ...(assigned ? { attemptNo: 3, attemptsLeft: 0 } : {}),
    });
  });

  it("điểm 0 vẫn là đã chấm: gọi refresh đúng 1 lần", async () => {
    const result = await submitAttempt(student, { ...input, answer: ["wrong"] });
    expect(result).toMatchObject({ score: 0, graded: true });
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
  });

  it("await refresh xong mới trả kết quả", async () => {
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
      expect(committed).toBe(true);
      expect(finished).toBe(false);
    } finally {
      release();
      await request;
    }
  });

  it("recompute lỗi: vẫn trả kết quả cũ, chỉ log studentId/skill/mã lỗi", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    recomputeMock.mockRejectedValue(Object.assign(new Error("NOI_DUNG_BI_MAT"), { code: "P2002" }));
    const result = await submitAttempt(student, input);

    expect(committed).toBe(true);
    expect(tx.attempt.create).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledExactlyOnceWith(db, 42);
    expect(result).toEqual({ ...expected, explanation: exercise.explanation });
    expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
      "[skill-profiles] refresh_after_grading_failed",
      { studentId: student.id, skill: "FOUNDATION", code: "P2002" },
    );
  });

  it.each(["answer", "permission", "limit", "race", "speaking", "commit"])(
    "%s: bị từ chối/lưu thất bại thì không gọi refresh", async (reason) => {
      let body: CreateAttemptInput = { ...input, assignmentId: 21 };
      let statusCode = 400;
      if (reason === "answer") body = { ...body, answer: "sai hình dạng" };
      if (reason === "permission") {
        db.classMember.findUnique.mockResolvedValue(null);
        statusCode = 404;
      }
      if (reason === "limit" || reason === "race") {
        (reason === "limit" ? db : tx).attempt.count.mockResolvedValue(3);
        statusCode = 409;
      }
      if (reason === "speaking") {
        db.exercise.findFirst.mockResolvedValue({ ...exercise, type: "speaking" });
        statusCode = 400;
      }
      if (reason === "commit") {
        db.$transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => {
          await work(tx);
          throw Object.assign(new Error("COMMIT_FAILED"), { statusCode: 500 });
        });
        statusCode = 500;
      }

      await expect(submitAttempt(student, body)).rejects.toMatchObject({ statusCode });
      expect(committed).toBe(false);
      if (reason !== "commit") expect(tx.attempt.create).not.toHaveBeenCalled();
      expect(refreshSpy).not.toHaveBeenCalled();
      expect(recomputeMock).not.toHaveBeenCalled();
    },
  );
});
