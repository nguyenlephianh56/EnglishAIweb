/**
 * Test đơn vị (KHÔNG cần DB) cho logic thuần của GET /attempts (attempt-list.ts).
 */

import { describe, it, expect } from "vitest";
import {
  finalScoreOf,
  hasHistoryFilter,
  toAttemptListItem,
  buildAttemptListResponse,
  type AttemptListRow,
} from "./attempt-list";

const row = (over: Partial<AttemptListRow> = {}): AttemptListRow => ({
  id: 1,
  exerciseId: 10,
  assignmentId: null,
  mode: "practice",
  score: 7,
  maxScore: 10,
  teacherScore: null,
  isLate: false,
  submittedAt: new Date("2026-11-01T10:00:00.000Z"),
  ...over,
});

describe("finalScoreOf = COALESCE(teacher_score, score)", () => {
  it("không có điểm GV: lấy điểm máy", () => {
    expect(finalScoreOf(7, null)).toBe(7);
  });
  it("điểm GV ghi đè, kể cả khi thấp hơn điểm máy", () => {
    expect(finalScoreOf(9, 4)).toBe(4);
  });
  it("điểm GV ghi đè, kể cả khi cao hơn điểm máy", () => {
    expect(finalScoreOf(2, 9)).toBe(9);
  });
  it("teacher_score = 0 vẫn là điểm cuối (không bị `||` nuốt)", () => {
    expect(finalScoreOf(7, 0)).toBe(0);
  });
  it("điểm máy null + không có điểm GV -> null; có điểm GV -> điểm GV", () => {
    expect(finalScoreOf(null, null)).toBeNull();
    expect(finalScoreOf(null, 6)).toBe(6);
  });
});

describe("toAttemptListItem", () => {
  it("trả đúng các field của danh sách, kèm attemptNo và finalScore", () => {
    const item = toAttemptListItem(
      row({ id: 5, assignmentId: 3, score: 9, teacherScore: 4, isLate: true }),
      2
    );
    expect(item).toEqual({
      id: 5,
      exerciseId: 10,
      assignmentId: 3,
      mode: "practice",
      attemptNo: 2,
      score: 9,
      maxScore: 10,
      teacherScore: 4,
      finalScore: 4,
      isLate: true,
      submittedAt: new Date("2026-11-01T10:00:00.000Z"),
    });
  });

  it("làm tròn 2 chữ số thập phân", () => {
    const item = toAttemptListItem(row({ score: 6.666666, teacherScore: null }), 1);
    expect(item.score).toBe(6.67);
    expect(item.finalScore).toBe(6.67);
  });

  it("chưa có điểm: score/finalScore/teacherScore đều null", () => {
    const item = toAttemptListItem(row({ score: null, teacherScore: null }), 1);
    expect(item.score).toBeNull();
    expect(item.teacherScore).toBeNull();
    expect(item.finalScore).toBeNull();
  });

  it("danh sách trắng: field thừa của dòng DB (answer, errors, studentId...) không lọt ra", () => {
    const dirty = {
      ...row(),
      studentId: 99,
      answer: ["secret"],
      errors: [{ type: "vocab", text: "x", correction: "SECRET" }],
      aiFeedback: { comment: "c" },
      teacherComment: "nhận xét",
      exercise: { answer: ["SECRET"], explanation: "SECRET" },
    } as AttemptListRow;
    const item = toAttemptListItem(dirty, 1);
    expect(Object.keys(item).sort()).toEqual(
      [
        "assignmentId",
        "attemptNo",
        "exerciseId",
        "finalScore",
        "id",
        "isLate",
        "maxScore",
        "mode",
        "score",
        "submittedAt",
        "teacherScore",
      ].sort()
    );
    expect(JSON.stringify(item)).not.toContain("SECRET");
  });
});

describe("hasHistoryFilter", () => {
  it("chỉ true khi có assignmentId hoặc exerciseId", () => {
    expect(hasHistoryFilter({})).toBe(false);
    expect(hasHistoryFilter({ assignmentId: 1 })).toBe(true);
    expect(hasHistoryFilter({ exerciseId: 1 })).toBe(true);
  });
});

describe("buildAttemptListResponse", () => {
  const base = { items: [], page: 2, limit: 10, total: 13, best: 8.456 };

  it("có lọc: bestScore (làm tròn) và attemptsCount = total", () => {
    expect(buildAttemptListResponse({ ...base, filtered: true })).toEqual({
      items: [],
      page: 2,
      limit: 10,
      total: 13,
      bestScore: 8.46,
      attemptsCount: 13,
    });
  });

  it("không lọc: bestScore và attemptsCount đều null dù có dữ liệu", () => {
    const r = buildAttemptListResponse({ ...base, filtered: false });
    expect(r.bestScore).toBeNull();
    expect(r.attemptsCount).toBeNull();
    expect(r.total).toBe(13);
  });

  it("có lọc nhưng chưa có điểm nào: bestScore null, attemptsCount vẫn đúng", () => {
    const r = buildAttemptListResponse({ ...base, best: null, total: 2, filtered: true });
    expect(r.bestScore).toBeNull();
    expect(r.attemptsCount).toBe(2);
  });

  it("bestScore = 0 vẫn là 0, không bị đổi thành null", () => {
    const r = buildAttemptListResponse({ ...base, best: 0, filtered: true });
    expect(r.bestScore).toBe(0);
  });
});