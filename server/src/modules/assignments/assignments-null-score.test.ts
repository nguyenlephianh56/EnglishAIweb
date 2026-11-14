/**
 * Test thuần (KHÔNG cần DB): bài giao mà HS đã nộp nhưng chưa có điểm (score NULL)
 * vẫn là SUBMITTED, đếm đúng x/3, điểm cao nhất NULL (không phải 0); GV vẫn thấy bài nộp.
 */
import { describe, it, expect } from "vitest";
import {
  buildSubmissionsResponse,
  toStudentAssignmentItem,
  toSubmissionItem,
} from "./assignments-view";

const HOUR = 60 * 60 * 1000;
const now = new Date("2026-11-15T10:00:00.000Z");
const at = (h: number) => new Date(now.getTime() + h * HOUR);

const row = {
  id: 11,
  dueAt: at(24),
  exercise: {
    id: 7,
    type: "writing",
    skill: "WRITING",
    level: "B1",
    topic: "Weekend",
  },
  class: { id: 3, name: "Lớp A" },
};

describe("trạng thái bài giao của HS khi chưa có điểm", () => {
  it("đã nộp 1 lần, best NULL -> SUBMITTED, 1/3, bestScore null", () => {
    const item = toStudentAssignmentItem(
      row,
      { attemptsUsed: 1, best: null, late: false },
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.attemptsUsed).toBe(1);
    expect(item.maxAttempts).toBe(3);
    expect(item.bestScore).toBeNull();
    expect(item.lateSubmission).toBe(false);
  });

  it("nộp trễ mà chưa chấm -> vẫn SUBMITTED, lateSubmission true, bestScore null", () => {
    const item = toStudentAssignmentItem(
      { ...row, dueAt: at(-5) },
      { attemptsUsed: 3, best: null, late: true },
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.attemptsUsed).toBe(3);
    expect(item.bestScore).toBeNull();
    expect(item.lateSubmission).toBe(true);
  });

  it("có lần đã chấm 0 điểm -> bestScore 0 (khác NULL)", () => {
    const item = toStudentAssignmentItem(
      row,
      { attemptsUsed: 2, best: 0, late: false },
      now
    );
    expect(item.bestScore).toBe(0);
  });
});

describe("danh sách bài nộp của GV khi chưa có điểm", () => {
  const student = (id: number, name: string) => ({
    id,
    name,
    email: `${name}@test.local`,
  });

  it("HS đã nộp nhưng chưa chấm -> SUBMITTED, bestScore null, bestAttemptId null", () => {
    const item = toSubmissionItem(
      student(1, "an"),
      {
        attemptsUsed: 2,
        best: null,
        bestAttemptId: 55, // SQL vẫn trả một id; điểm NULL thì không trỏ tới
        late: false,
        lastSubmittedAt: at(-2),
      },
      at(24),
      now
    );
    expect(item.status).toBe("SUBMITTED");
    expect(item.attemptsUsed).toBe(2);
    expect(item.bestScore).toBeNull();
    expect(item.bestAttemptId).toBeNull();
    expect(item.lastSubmittedAt).toEqual(at(-2));
  });

  it("GV vẫn thấy cả HS chưa chấm lẫn HS đã chấm trong cùng bài giao", () => {
    const stats = new Map([
      [
        1,
        { attemptsUsed: 1, best: null, bestAttemptId: 10, late: false, lastSubmittedAt: at(-1) },
      ],
      [
        2,
        { attemptsUsed: 1, best: 8, bestAttemptId: 11, late: false, lastSubmittedAt: at(-1) },
      ],
    ]);
    const res = buildSubmissionsResponse(
      {
        id: 11,
        dueAt: at(24),
        exercise: row.exercise,
        class: { id: 3, name: "Lớp A" },
      },
      [student(1, "an"), student(2, "binh")],
      stats,
      now
    );
    const ungraded = res.items.find((s) => s.studentId === 1)!;
    const graded = res.items.find((s) => s.studentId === 2)!;
    expect(ungraded.bestScore).toBeNull();
    expect(ungraded.status).toBe("SUBMITTED");
    expect(graded.bestScore).toBe(8);
    expect(graded.bestAttemptId).toBe(11);
    expect(res.totalStudents).toBe(2);
    expect(res.submittedCount).toBe(2);
  });
});