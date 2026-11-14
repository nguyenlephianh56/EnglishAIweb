/**
 * Test thuần (KHÔNG cần DB): lần nộp chưa chấm (score = NULL, vd bài writing chờ AI)
 * không làm vỡ kết quả nộp bài và lịch sử; NULL không bị tính thành 0.
 */
import { describe, it, expect } from "vitest";
import { buildAttemptResult } from "./attempt-result";
import {
  buildAttemptListResponse,
  toAttemptListItem,
  type AttemptListRow,
} from "./attempt-list";

const exercise = {
  id: 9,
  type: "writing",
  skill: "WRITING",
  level: "B1",
  topic: "Weekend",
  content: { prompt: "Write.", minWords: 50 },
  answer: null,
};

describe("buildAttemptResult: graded", () => {
  it("score NULL, chưa có điểm GV -> graded false, score null (không phải 0)", () => {
    const r = buildAttemptResult(
      { id: 1, score: null, maxScore: 10, errors: [] },
      exercise,
      { reveal: false }
    );
    expect(r.graded).toBe(false);
    expect(r.score).toBeNull();
  });

  it("có điểm máy -> graded true", () => {
    const r = buildAttemptResult(
      { id: 1, score: 7, maxScore: 10, errors: [] },
      exercise,
      { reveal: false }
    );
    expect(r.graded).toBe(true);
  });

  it("điểm 0 là ĐÃ chấm (graded true), khác với NULL", () => {
    const r = buildAttemptResult(
      { id: 1, score: 0, maxScore: 10, errors: [] },
      exercise,
      { reveal: false }
    );
    expect(r.graded).toBe(true);
    expect(r.score).toBe(0);
  });

  it("GV chấm tay khi AI chưa chấm -> graded true", () => {
    const r = buildAttemptResult(
      { id: 1, score: null, maxScore: 10, errors: [], teacherScore: 8 },
      exercise,
      { reveal: false }
    );
    expect(r.graded).toBe(true);
    expect(r.score).toBeNull(); // score máy vẫn NULL, điểm GV nằm ở finalScore của chi tiết
  });

  it("errors NULL trong DB (JSON null) -> errors [] không lỗi", () => {
    const r = buildAttemptResult(
      { id: 1, score: null, maxScore: 10, errors: null },
      exercise,
      { reveal: true }
    );
    expect(r.errors).toEqual([]);
  });
});

describe("toAttemptListItem / buildAttemptListResponse với điểm NULL", () => {
  const row = (over: Partial<AttemptListRow> = {}): AttemptListRow => ({
    id: 1,
    exerciseId: 10,
    assignmentId: null,
    mode: "practice",
    score: null,
    maxScore: 10,
    teacherScore: null,
    isLate: false,
    submittedAt: new Date("2026-11-15T10:00:00.000Z"),
    ...over,
  });

  it("chưa chấm: score/finalScore null, graded false", () => {
    const item = toAttemptListItem(row(), 1);
    expect(item.score).toBeNull();
    expect(item.teacherScore).toBeNull();
    expect(item.finalScore).toBeNull();
    expect(item.graded).toBe(false);
  });

  it("điểm GV ghi đè khi score NULL -> finalScore = điểm GV, graded true", () => {
    const item = toAttemptListItem(row({ teacherScore: 6.5 }), 1);
    expect(item.finalScore).toBe(6.5);
    expect(item.graded).toBe(true);
  });

  it("teacher_score = 0 vẫn là đã chấm", () => {
    const item = toAttemptListItem(row({ teacherScore: 0 }), 1);
    expect(item.finalScore).toBe(0);
    expect(item.graded).toBe(true);
  });

  it("toàn bộ lần nộp chưa chấm -> bestScore null (không phải 0)", () => {
    const res = buildAttemptListResponse({
      items: [toAttemptListItem(row(), 1)],
      page: 1,
      limit: 20,
      total: 1,
      best: null, // MAX(COALESCE(...)) của SQL khi mọi dòng NULL
      filtered: true,
    });
    expect(res.bestScore).toBeNull();
    expect(res.attemptsCount).toBe(1);
  });
});